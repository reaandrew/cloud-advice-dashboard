const autoscalingDimensionsAgg = (groupKey) => [
    {$group: {
        _id: {
            key: `$${groupKey}`,
            min: { $toString: "$Configuration.MinSize" },
            max: { $toString: "$Configuration.MaxSize" },
            desired: { $toString: "$Configuration.DesiredCapacity" },
        },
        count: { $count: {} },
    }},
    {$group: {
        _id :  "$_id.key",
        rows: {
            $push: {
                "Min Size": "$_id.min",
                "Max Size": "$_id.max",
                "Desired Capacity": "$_id.desired",
                Count: {$sum: "$count"}
            }
        }
    }}
];

const autoscalingDetailsAgg = [
    {$project: {
        _id: 0,
        accountDetails: 1,
        "ARN": "$Configuration.AutoScalingGroupARN",
        "Name": "$Configuration.Name",
        "Min Size": { $toString: "$Configuration.MinSize" },
        "Max Size": { $toString: "$Configuration.MaxSize" },
        "Desired Capacity": { $toString: "$Configuration.DesiredCapacity" },
        "Availability Zones": "$Configuration.AvailabilityZones",
        "Target Groups": { "$cond": {
              if: { $isArray: "$Configuration.TargetGroupARNs" },
              then: { $size: "$Configuration.TargetGroupARNs" },
              else: 0,
        }},
        "Creation Date": "$Configuration.CreationDate"
    }},
]

const autoscalingDimensionsViewOptions = {
    type: "table",
    header: ["Min Size", "Max Size", "Desired Capacity", "Count"],
    links: [{
        field: "Count",
        forward: ["Min Size", "Max Size", "Desired Capacity"],
        path: "/compliance/autoscaling/details",
    }],
    title: "Auto Scaling Group Dimensions",
    description: "Auto Scaling Group Dimensions configurations (Min/Max/Desired).",
    url: "/compliance/autoscaling/dimensions",
    firstCellIsHeader: false,
};

const autoscalingDetailsViewOptions = {
    type: "details_list",
    id_field: "ARN",
    prominent_fields: ["Name"],
    filterable_fields: [
        { name: "Min Size", selector: "Min Size"},
        { name: "Max Size", selector: "Max Size"},
        { name: "Desired Capacity", selector: "Desired Capacity"},
    ],
    searchable_fields: ["ARN", "Name"],
    details_fields: ["ARN", "Min Size", "Max Size", "Desired Capacity", "Availability Zones", "Target Groups", "Creation Date"],
    title: "Auto Scaling Groups",
    description: "All Auto Scaling Groups.",
    url: "/compliance/autoscaling/details",
};

async function getEmptyAutoscalingGroups(req, year, month, day) {
    return req.collection("autoscaling_groups").find(
        {
            year: year,
            month: month,
            day: day,
            "Configuration.Instances": { $size: 0 }
        },
        { projection: { account_id: 1 } }
    );
}

async function countEmptyAutoscalingGroups(req, year, month, day) {
    const teamCounts = new Map();

    const results = await req.getDetailsForAllAccounts();

    const asgCursor = await getEmptyAutoscalingGroups(req, year, month, day);

    for await (const doc of asgCursor) {
        results.findByAccountId(doc.account_id).teams.forEach(team => teamCounts.set(team, (teamCounts.get(team) || 0) + 1));
    }

    return teamCounts;
}

module.exports = {
    autoscalingDimensions: {
        collection: "autoscaling_groups",
        agg: autoscalingDimensionsAgg,
        viewOptions: autoscalingDimensionsViewOptions,
    },
    autoscalingDetails: {
        collection: "autoscaling_groups",
        agg: autoscalingDetailsAgg,
        viewOptions: autoscalingDetailsViewOptions,
    },
    countEmptyAutoscalingGroups
};
