const createDateFilter = (from, to) => ({ $and: [{ "$gte": [{ $dateDiff: { startDate: "$Configuration.CreationDate", endDate: "$$NOW", unit: "day" } }, from]}, { "$lt": [{ $dateDiff: { startDate: "$Configuration.CreationDate", endDate: "$$NOW", unit: "day" } }, to]}]})
const dateFilters = {
    "0-30 days": createDateFilter(0, 30),
    "30-90 days": createDateFilter(30, 90),
    "90-180 days": createDateFilter(90, 180),
    "180-365 days": createDateFilter(180, 365),
    "1-2 years": createDateFilter(365, 730),
    "2+ years": createDateFilter(730, 100000),
};

const keyAgesAgg = (groupKey) => [
    {$group: {
        _id: {
            key: `$${groupKey}`,
            age: {$switch: {
                branches: Object.entries(dateFilters).map(([name, filter]) => ({ case: filter, then: name })),
                default: "Unexpected Error. KMS Key reports to be 300+ years old. Please report to administrator."
            }}
        },
        count: { $count: {} }
    }},
    {$group: {
        _id :  "$_id.key",
        rows: {
            $push: {
                "Age Range": "$_id.age",
                Count: {$sum: "$count"}
            }
        }
    }}
];

const keyDetailsAgg = [
    {$addFields: {
        "age_range": {$switch: {
            branches: Object.entries(dateFilters).map(([name, filter]) => ({ case: filter, then: name })),
            default: "Unexpected Error. KMS Key reports to be 300+ years old. Please report to administrator."
        }}
    }},
    {$project: {
        _id: 0,
        accountDetails: 1, // Always required
        "Key ID": "$Configuration.KeyId",
        "ARN": "$Configuration.Arn",
        "Creation Date": "$Configuration.CreationDate",
        "Key State": "$Configuration.KeyState",
        "Key Usage": "$Configuration.KeyUsage",
        "Key Spec": "$Configuration.CustomerMasterKeySpec",
        "Age Range": "$age_range",
    }},
]

const keyAgesViewOptions = {
    type: "table", // simple table each field is a column and each document is a row.
    header: ["Age Range", "Count"],
    links: [{ // hyperlink to the details page forwarding the age range value.
        field: "Count",
        forward: ["Age Range"],
        path: "/compliance/kms/details",
    }],
    title: "KMS Key Ages",
    description: "Age distribution of AWS KMS Keys.",
    url: "/compliance/kms",
    firstCellIsHeader: false,
};

const keyDetailsViewOptions = {
    type: "details_list", // A 'details' paged with collapsable rows.
    id_field: "Key ID", // The main field to display. Must be unique.
    prominent_fields: ["Age Range"], // Fields to pull out into the main table.
    filterable_fields: [ // Fields to filter on.
        { name: "Age Range", selector: "Age Range" },
    ],
    searchable_fields: ["ARN"], // Fields to search on.
    details_fields: ["ARN", "Creation Date", "Key State", "Key Usage", "Key Spec"], // Fields to hide in details section. id_field will always be included.
    title: "KMS Keys",
    description: "All AWS KMS keys",
    url: "/compliance/kms/details",
};

// Standard export format.
module.exports = {
    keyAges: {
        collection: "kms_key_metadata", // The starting collection to start the query on.
        agg: keyAgesAgg,
        viewOptions: keyAgesViewOptions,
    },
    keyDetails: {
        collection: "kms_key_metadata",
        agg: keyDetailsAgg,
        viewOptions: keyDetailsViewOptions,
    },
};
