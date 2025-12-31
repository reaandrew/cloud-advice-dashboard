const createDateFilter = (from, to) => ({ $and: [{ "$gte": [{ $dateDiff: { startDate: {$dateFromString: { dateString: "$Configuration.CreationDate" }}, endDate: "$$NOW", unit: "day" } }, from]}, { "$lt": [{ $dateDiff: { startDate: {$dateFromString: { dateString: "$Configuration.CreationDate" }}, endDate: "$$NOW", unit: "day" } }, to]}]})
const dateFilters = {
    "0-30 days": createDateFilter(0, 30),
    "30-90 days": createDateFilter(30, 90),
    "90-180 days": createDateFilter(90, 180),
    "180-365 days": createDateFilter(180, 365),
    "1-2 years": createDateFilter(365, 730),
    "2+ years": createDateFilter(730, 100000),
};
const compliantDateFilters = ["0-30 days", "30-90 days"];

const kmsKeysView = {
    id: "kms_keys", // A machine friendly name for the view. Allowed characters: [a-z_]
    name: "KMS Keys", // A human friendly name for the view
    collection: "kms_key_metadata", // The collection to start aggregating from
    pipeline: [
        {$addFields: {
            "age_range": {$switch: {
                branches: Object.entries(dateFilters).map(([name, filter]) => ({ case: filter, then: name })),
                default: "Unexpected Error. KMS Key reports to be 300+ years old. Please report to administrator."
            }},
        }},
        {$project: {
            _id: 0,
            account_id: 1, // Always required
            "Key ID": "$Configuration.KeyId",
            "ARN": "$Configuration.Arn",
            "Creation Date": "$Configuration.CreationDate",
            "Key State": "$Configuration.KeyState",
            "Key Usage": "$Configuration.KeyUsage",
            "Key Spec": "$Configuration.CustomerMasterKeySpec",
            "Age Range": "$age_range",
            //"Tags": "$Configuration.Tags", // TODO: merge with kms_key_resource_tags once added to data collection script. Also look at tagging view to convert list of key values to a string.
        }},
    ], // Aggregation pipeline to establish the MongoDB view on.
    idField: "Key ID", // The main field to display. Must be unique.
    prominentFields: ["Age Range"], // Fields to pull out into the main table.
    filterableFields: [ // Fields to filter on.
        { name: "Age Range", idSelector: "Age Range" },
    ],
    searchableFields: ["ARN"], // Fields to search on.
    detailsFields: ["ARN", "Creation Date", "Key State", "Key Usage", "Key Spec"], // Fields to hide in details section. id_field will always be included.
};

const ageGroup = (groupKey) => ({$group: {
    _id: {
        key: groupKey == null ? null : `$${groupKey}`, // This stage with this group key must always be included. This will be used to group by the available groupable fields.
        age: "$Age Range" // Additional fields to group by.
    },
    count: { $count: {} }
}})

const kmsKeysRule = {
    id: "KMS1", // A unique ID describing this view. Note this will be visible to users.
    name: "KMS Key Ages", // A human readable name describing the view id.
    description: "Age distribution of AWS KMS Keys. Compliant if KMS Keys are more than 90 days old", // A detailed description describing the view in more details. In the future this will link back to the policy.
    view: kmsKeysView.id, // The id of the compliance view to query from.
    pipeline: (groupKey) => [
        ageGroup(groupKey),
        {$group: {
            _id: "$_id.key", // This stage with this group key must always be included. This collects your results of other groups together.
            rows: {
                $push: {
                    "Age Range": "$_id.age", // Naming fields with a human readable name.
                    Count: {$sum: "$count"}, // You should modify this based on the aggregation performed.
                    Compliant: {$in: ["$_id.age", compliantDateFilters]}, // Boolean value describing whether row is compliant.
                }
            },
        }}
    ], // Aggregation pipeline to aggregate and project data on. Note: you should avoid using joins on non-views as the details of these will not visible to users,
    header: ["Age Range", "Count"], // Header names for the resulting table.
    links: [{ // Hyperlinks to the views
        field: "Count", // The field to hyperlink
        forward: ["Age Range"], // The query parameters to forward
        view: kmsKeysView.id, // The view to forward to.
    }],
    threshold: 100, // Threshold describing the percentage of resources that need to be compliant for the rule to be compliant
};

module.exports = {
    kmsKeysRule,
    kmsKeysView,
};
