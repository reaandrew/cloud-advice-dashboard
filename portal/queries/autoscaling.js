const autoscalingGroupsView = {
    id: "autoscaling_groups",
    name: "Auto Scaling Groups",
    collection: "autoscaling_groups",
    pipeline: [
        {$project: {
            _id: 0,
            account_id: 1,
            "ARN": "$Configuration.AutoScalingGroupARN",
            "Name": "$Configuration.AutoScalingGroupName",
            "Min Size": { $toString: "$Configuration.MinSize" },
            "Max Size": { $toString: "$Configuration.MaxSize" },
            "Desired Capacity": { $toString: "$Configuration.DesiredCapacity" },
            "Availability Zones": {$reduce: {
                input: "$Configuration.AvailabilityZones",
                initialValue: "",
                in: {$concat: ["$$this", " "]},
            }},
            "Tags": {$reduce: {
                input: "$Configuration.Tags",
                initialValue: "",
                in: {$concat: ["$$this.Key", "=", "$$this.Value", " "]},
            }},
            "Target Groups": { "$cond": { // TODO: Add this to our synthetic data. This is optional in the api.
                  if: { $isArray: "$Configuration.TargetGroupARNs" },
                  then: { $size: "$Configuration.TargetGroupARNs" },
                  else: 0,
            }},
            "Creation Date": "$Configuration.CreatedTime"
        }},
    ],
    idField: "Name",
    prominentFields: ["Creation Date"],
    filterableFields: [
        { name: "Min Size", idSelector: "Min Size"},
        { name: "Max Size", idSelector: "Max Size"},
        { name: "Desired Capacity", idSelector: "Desired Capacity"},
    ],
    searchableFields: ["ARN", "Name", "Tags"],
    detailsFields: ["ARN", "Min Size", "Max Size", "Desired Capacity", "Availability Zones", "Target Groups", "Creation Date", "Tags"],
};

const autoscalingGroupDimensionsRule = {
    id: "AUTO1",
    name: "Autoscaling Group Dimensions",
    description: "Auto Scaling Group Dimensions configurations (Min/Max/Desired).",
    view: autoscalingGroupsView.id,
    pipeline: (groupKey) => [
        {$group: {
            _id: {
                key: `$${groupKey}`,
                min: "$Min Size",
                max: "$Max Size",
                desired: "$Desired Capacity",
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
    ],
    header: ["Min Size", "Max Size", "Desired Capacity", "Count"],
    links: [{
        field: "Count",
        forward: ["Min Size", "Max Size", "Desired Capacity"],
        view: autoscalingGroupsView.id,
    }],
};

module.exports = {
    autoscalingGroupsView,
    autoscalingGroupDimensionsRule,
};
