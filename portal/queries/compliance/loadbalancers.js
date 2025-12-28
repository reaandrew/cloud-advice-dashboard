const latestTLS = "ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09";

const loadBalancersView = {
    id: "load_balancers",
    name: "Load Balancers (ALB/NLB/CLB)",
    collection: "elb_v2",
    pipeline: [,
        {
            $unionWith: {
                coll: "elb_classic",
                pipeline: [
                    {
                        $project: {
                            "Configuration": "$Configuration",
                            "is_classic_source": { $literal: true }
                        }
                    }
                ]
            }
        },
        {
            $lookup: {
                from: "elb_v2_listeners",
                localField: "Configuration.LoadBalancerArn",
                foreignField: "Configuration.LoadBalancerArn",
                as: "attached_listeners"
            }
        },
        {
            $addFields: {
                compliance_status: {
                    $let: {
                        vars: {
                            isClassic: {
                                $or: [
                                    { $eq: ["$is_classic_source", true] },
                                    { $gt: [{ $size: { $ifNull: ["$Configuration.ListenerDescriptions", []] } }, 0] }
                                ]
                            },
                            safeListeners: { $ifNull: ["$attached_listeners", []] }
                        },
                        in: {
                            $switch: {
                                branches: [
                                    { case: "$$isClassic", then: "DEPRECATED_CLASSIC_ELB" },
                                    { case: { $eq: [{ $size: "$$safeListeners" }, 0] }, then: "NO_LISTENERS" },
                                    {
                                        case: {
                                            $anyElementTrue: {
                                                $map: {
                                                    input: "$$safeListeners",
                                                    as: "l",
                                                    in: {
                                                        $and: [
                                                            { $in: [{ $ifNull: ["$$l.Configuration.Protocol", ""] }, ["HTTPS", "TLS"]] },
                                                            { $ne: [{ $ifNull: ["$$l.Configuration.SslPolicy", ""] }, latestTLS] }
                                                        ]
                                                    }
                                                }
                                            }
                                        },
                                        then: "OUTDATED_TLS_POLICY"
                                    }
                                ],
                                default: "COMPLIANT"
                            }
                        }
                    }
                }
            }
        },
        {
            $project: {
                _id: 0,
                account_id: 1,
                "Id": { $ifNull: ["$Configuration.LoadBalancerArn", "$Configuration.LoadBalancerName"] },
                "Name": "$Configuration.LoadBalancerName",
                "Type": {
                    $cond: [
                        { $ifNull: ["$Configuration.Type", false] },
                        "$Configuration.Type",
                        "classic"
                    ]
                },
                "Scheme": { $ifNull: ["$Configuration.Scheme", "unknown"] },
                "Compliance Status": "$compliance_status",
                "DNS Name": { $ifNull: ["$Configuration.DNSName", "N/A"] },
                "TLS Policy": {
                    $cond: [
                        { $eq: ["$compliance_status", "DEPRECATED_CLASSIC_ELB"] },
                        "Classic (V1) - No PQ Support",
                        {
                            $let: {
                                vars: {
                                    policyList: {
                                        $map: {
                                            input: { $ifNull: ["$attached_listeners", []] },
                                            as: "lis",
                                            in: { $convert: { input: "$$lis.Configuration.SslPolicy", to: "string", onError: "None", onNull: "None" } }
                                        }
                                    }
                                },
                                in: {
                                    $let: {
                                        vars: { uniqueList: { $setUnion: ["$$policyList"] } },
                                        in: {
                                            $cond: [
                                                { $eq: [{ $size: { $ifNull: ["$$uniqueList", []] } }, 0] },
                                                "None (Plaintext)",
                                                {
                                                    $reduce: {
                                                        input: { $ifNull: ["$$uniqueList", []] },
                                                        initialValue: "",
                                                        in: {
                                                            $concat: [
                                                                "$$value",
                                                                { $cond: [{ $eq: ["$$value", ""] }, "", ", "] },
                                                                { $toString: "$$this" }
                                                            ]
                                                        }
                                                    }
                                                }
                                            ]
                                        }
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        }
    ],
    idField: "Name",
    prominentFields: ["Type", "Compliance Status", "TLS Policy"],
    filterableFields: [
        { name: "Type", idSelector: "Type" },
        { name: "Compliance Status", idSelector: "Compliance Status" },
        { name: "TLS Policy", idSelector: "TLS Policy" },
    ],
    searchableFields: ["Id", "Name", "DNS Name", "TLS Policy"],
    detailsFields: ["Id", "Scheme", "DNS Name"]
};

const loadBalancerComplianceRule = {
    id: "ELB1",
    name: "Load Balancer TLS",
    description: "Evaluates ELB security posture based on Type and TLS Policy version (Latest: 2025 PQ-TLS).",
    view: loadBalancersView.id,
    pipeline: (groupKey) => [
        {
            $group: {
                _id: {
                    key: `$${groupKey}`,
                    compliance: "$Compliance Status",
                    policy: "$TLS Policy"
                },
                count: { $count: {} }
            }
        },
        {
            $group: {
                _id: "$_id.key",
                rows: {
                    $push: {
                        "Compliance Status": "$_id.compliance",
                        "TLS Policy": "$_id.policy",
                        "Count": { $sum: "$count" }
                    }
                }
            }
        }
    ],
    header: ["Compliance Status", "TLS Policy", "Count"],
    links: [{
        field: "Count",
        forward: ["Compliance Status", "TLS Policy"],
        view: loadBalancersView.id,
    }],
};

module.exports = {
    loadBalancersView,
    loadBalancerComplianceRule
};
