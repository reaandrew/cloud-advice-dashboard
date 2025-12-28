const accountLookup = [
    {$lookup: {
        from: "account_details",
        localField: "account_id",
        foreignField: "account_id",
        pipeline: [{ $project: { _id: 0, account_id: 1, team: 1, tenant: 1, environment: 1, groups: 1 } }],
        as: "accountDetailsArr"
    }},
    {$addFields: {
        accountDetails: {$ifNull: [
            {$arrayElemAt: ["$accountDetailsArr", 0]},
            { account_id: "unknown", team: "unknown", tenant: { id: "unknown", name: "unknown", description: "unknown" }, environment: "unknown", groups: [] }
        ]}
    }}
];

const security = (groups) => groups.includes("*") ? [] : [
    {$match: {
        $or: [
          { _is_empty_marker: true },
          { "accountDetails.groups": { $in: groups } }
        ]
    }}
];

const latestOnly = [
    {$facet: {
        latest: [
            { $sort: { year: -1, month: -1, day: -1 } },
            { $limit: 1 }
        ],
        current: [{ $match: {} }]
    }},
    {$unwind: {
        path: "$current",
        preserveNullAndEmptyArrays: true
    }},
    {$match: {
        $expr: {$or: [
            {$eq: [{ $type: "$current" }, "missing"]},
            {$and: [
                {$eq: ["$current.year", { $arrayElemAt: ["$latest.year", 0] }]},
                {$eq: ["$current.month", { $arrayElemAt: ["$latest.month", 0] }]},
                {$eq: ["$current.day", { $arrayElemAt: ["$latest.day", 0] }]}
            ]}
        ]}
    }},
    {$replaceRoot: {
        newRoot: {$ifNull: ["$current", { _is_empty_marker: true }]}
    }}
];

module.exports = { accountLookup, security, latestOnly };
