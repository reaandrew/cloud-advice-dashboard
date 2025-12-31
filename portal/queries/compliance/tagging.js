const createMissingTagCondition = (tagName) => ({$cond: {
    if: {$or: [
        {$not: {
            $in: [
                tagName,
                {$map: {
                    input: "$tags",
                    as: "tag",
                    in: "$$tag.Key"
                }}
            ]
        }},
        {$eq: [
            {$arrayElemAt: [
                {$map: { // Note from AI: performance limitation in this approach. Consider rewriting with elemMatch.
                    input: {$filter: {
                        input: "$tags",
                        as: "tag",
                        cond: { $eq: [ "$$tag.Key", tagName ] }
                    }},
                    as: "filteredTag",
                    in: "$$filteredTag.Value"
                }},
                0
            ]},
            ""
        ]}
    ]},
    then: "true",
    else: "false"
}})

const missingTags = [
    { displayName: "Missing Billing Id", name: "missing_billing_id", cond: createMissingTagCondition("BillingId") }
]


const taggingView = {
    id: "resource_tagging",
    name: "Tagging of Resources",
    collection: "autoscaling_groups", // MongoDB aggregations needs a starting collection
    pipeline: [
        {$limit: 1},
        {$skip: 1},
        {$facet: { // Note from AI: memory-cliff >100MB of documents. Consider using a series of unionWith instead.
            autoscalingGroups: [
                {$unionWith: `autoscaling_groups`},
                {$project: {
                    account_id: 1,
                    _id: "$Configuration.AutoScalingGroupARN",
                    resource_id: "$Configuration.AutoScalingGroupName",
                    type: "Autoscaling Groups",
                    _type: "autoscaling_groups",
                    tags: "$Configuration.Tags" // Format for tags is Array<{ Key: string, Value: string }>
                }},
            ],
            kmsKeys: [
                {$unionWith: `kms_key_metadata`},
                //{$lookup: {
                //    from: "kms_key_aliases",
                //    localField: "$Configuration.Arn",
                //    foreignField: "$Configuration.KmsKeyArn",
                //    as: "alias"
                //}},
                //{$lookup: {
                //    from: "kms_key_resource_tags",
                //    localField: "$Configuration.Arn",
                //    foreignField: "$Configuration.Arn"
                //    as: "tags"
                //}},
                {$project: {
                    account_id: 1,
                    _id: "$Configuration.Arn",
                    resource_id: "$Configuration.KeyId", // TODO: once kms_key_aliases in the data update this and kms_view.
                    type: "KMS Keys",
                    _type: "kms_keys",
                    tags: [] // TODO: once kms_key_resource_tags in the data update this and kms_view.
                }},
            ],
        }},
        {$project: {
            allResources: { $concatArrays: ["$autoscalingGroups", "$kmsKeys"] }
        }},
        {$unwind: "$allResources"},
        {$replaceWith: "$allResources"},
        {$addFields: missingTags.reduce((obj, { name, cond }) => { obj[name] = cond; return obj; }, {})},
        {$project: {
            _id: 0,
            account_id: 1,
            linked_view: "$_type",
            "Resource Type": "$type",
            Arn: "$_id",
            Id: "$resource_id",
            ...(missingTags.reduce((obj, { displayName, name }) => { obj[displayName] = `$${name}`; return obj; }, {})),
            "All Tags": {$reduce: {
                input: "$tags",
                initialValue: "",
                in: {$concat: ["$$this.Key", "=", "$$this.Value", " "]},
            }},
            tags: 1,
        }},
    ],
    idField: "Id",
    prominentFields: ["Resource Type"],
    filterableFields: [
        { name: "Resource Type", idSelector: "Resource Type"},
        ...(missingTags.map(({ displayName }) => ({ name: displayName, idSelector: displayName })))
    ],
    searchableFields: ["Arn", "Id", "All Tags"],
    detailsFields: ["Arn", ...(missingTags.map(({ displayName }) => displayName)), "All Tags"],
}

const missingTagsRule = {
    id: "TAG1",
    name: "Missing Tags",
    description: "Organisational required tags that are missing from resources.",
    view: taggingView.id,
    pipeline: (groupKey) => [
        {$group: {
            _id: {
                key: `$${groupKey}`,
                "Resource Type": "$Resource Type",
                ...(missingTags.reduce((obj, { displayName }) => { obj[displayName] = `$${displayName}`; return obj; }, {}))
            },
            count: { $count: {} },
        }},
        {$group: {
            _id :  "$_id.key",
            rows: {
                $push: {
                    "Resource Type": "$_id.Resource Type",
                    ...(missingTags.reduce((obj, { displayName }) => { obj[displayName] = `$_id.${displayName}`; return obj; }, {})),
                    Count: {$sum: "$count"},
                    Compliant: {$and: missingTags.map(({ displayName }) => ({$eq: [`$_id.${displayName}`, "false"]}))},
                }
            }
        }}
    ],
    header: ["Resource Type", ...(missingTags.map(({displayName}) => displayName)), "Count"],
    links: [{
        field: "Count",
        forward: ["Resource Type", ...(missingTags.map(({displayName}) => displayName))],
        view: taggingView.id,
    }],
    threshold: 98,
};

module.exports = {
    taggingView,
    missingTagsRule,
};
