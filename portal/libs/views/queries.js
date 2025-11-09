const accountLookup = [
    {$lookup: {
        from: "account_details",
        localField: "account_id",
        foreignField: "account_id",
        pipeline: [{$project: { _id: 0, account_id: 1, team: 1, tenant: 1, environment: 1 }}],
        as: "accountDetailsArr"
    }},
    {$addFields: {
        accountDetails: {
            $arrayElemAt: ["$accountDetailsArr", 0]
        }
    }}
];

const latestOnly = [
    {$facet: {
        latest: [
            {$sort: { year: -1, month: -1, day: -1 }},
            {$limit: 1}
        ],
        current: []
    }},
    {$unwind: {path: "$current"}},
    {$match: { $expr: { $and: [
        { $eq: [ "$current.year", {$arrayElemAt: ["$latest.year", 0]} ] },
        { $eq: [ "$current.month", {$arrayElemAt: ["$latest.month", 0]} ] },
        { $eq: [ "$current.day", {$arrayElemAt: ["$latest.day", 0]} ] },
    ]}}},
    {$replaceRoot: { newRoot: "$current" }},
];

const toTableAgg = (agg) => (groupKey) => [
    ...latestOnly,
    ...accountLookup,
    ...agg(groupKey)
];

const toDetailsAgg = (agg, filterableFields, searchableFields) => (page, pageSize, filters, search) => [
    ...latestOnly,
    ...accountLookup,
    ...agg,
    ...(filters.length === 0 ? [] : [{$match: {$and: filters.map(([key, value]) => ({[key]: {$eq: value}}))}}]),
    ...(!search ? [] : [{$match: {$or: searchableFields.map((key) => ({[key]: {$regex: search, $options: "is"}}))}}]),
    {
        $facet: {
            metadata: [{ $count: "total_count" }],
            resources: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
            uniqueFields: [
                {$group: {
                    _id: null,
                    ...filterableFields
                        .map(f => [f.name, {$addToSet: `$${f.selector}`}])
                        .reduce((o,f) => { o[f[0]] = f[1]; return o; }, {})
                }}
            ],
        },
    }
];

module.exports = { toDetailsAgg, toTableAgg };
