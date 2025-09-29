const { getLatestDateForCollection } = require('../../utils/getLatestDate');

async function getLatestAutoscalingDate(req) {
    return getLatestDateForCollection(req, "autoscaling_groups");
}

async function getAutoscalingGroupsForDate(req, year, month, day, projection = null) {
    return req.collection("autoscaling_groups").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});
}

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

async function processAutoscalingDimensions(req, year, month, day) {
    const teamDimensions = new Map();

    const ensureTeam = t => {
        if (!teamDimensions.has(t))
            teamDimensions.set(t, { dimensions: new Map() });
        return teamDimensions.get(t);
    };

    const asgCursor = await getAutoscalingGroupsForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of asgCursor) {
        const recs = (await req.detailsByAccountId(doc.account_id)).teams.map(ensureTeam);

        if (doc.Configuration) {
            const min = doc.Configuration.MinSize || 0;
            const max = doc.Configuration.MaxSize || 0;
            const desired = doc.Configuration.DesiredCapacity || 0;
            const key = `${min}-${max}-${desired}`;
            recs.forEach(rec => rec.dimensions.set(key, (rec.dimensions.get(key) || 0) + 1));
        }
    }

    return teamDimensions;
}

async function getAutoscalingDimensionDetails(req, params) {
    const { year, month, day, team, min, max, desired } = params;
    const allResources = [];

    const asgCursor = await getAutoscalingGroupsForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

    for await (const doc of asgCursor) {
        if (!(await req.detailsByAccountId(doc.account_id)).teams.find(t => t === team)) continue;

        if (doc.Configuration) {
            const docMin = doc.Configuration.MinSize || 0;
            const docMax = doc.Configuration.MaxSize || 0;
            const docDesired = doc.Configuration.DesiredCapacity || 0;

            if (docMin == min && docMax == max && docDesired == desired) {
                allResources.push({
                    resourceId: doc.resource_id,
                    shortName: doc.Configuration?.AutoScalingGroupName || doc.resource_id,
                    accountId: doc.account_id,
                    dimensions: {
                        min: docMin,
                        max: docMax,
                        desired: docDesired
                    },
                    details: {
                        launchTemplate: doc.Configuration?.LaunchTemplate?.LaunchTemplateName || doc.Configuration?.LaunchConfigurationName || "N/A",
                        instanceCount: doc.Configuration?.Instances?.length || 0,
                        healthCheckType: doc.Configuration?.HealthCheckType || "Unknown",
                        healthCheckGracePeriod: doc.Configuration?.HealthCheckGracePeriod || 0,
                        availabilityZones: doc.Configuration?.AvailabilityZones?.join(", ") || "N/A",
                        vpcZones: doc.Configuration?.VPCZoneIdentifier || "N/A",
                        targetGroups: doc.Configuration?.TargetGroupARNs?.length || 0,
                        createdTime: doc.Configuration?.CreatedTime,
                        status: doc.Configuration?.Status || "Unknown"
                    }
                });
            }
        }
    }

    return allResources;
}

async function countEmptyAutoscalingGroups(req, year, month, day) {
    const teamCounts = new Map();

    const asgCursor = await getEmptyAutoscalingGroups(req, year, month, day);

    for await (const doc of asgCursor) {
        (await req.detailsByAccountId(doc.account_id)).teams.forEach(team => teamCounts.set(team, (teamCounts.get(team) || 0) + 1));
    }

    return teamCounts;
}

module.exports = {
    getLatestAutoscalingDate,
    getAutoscalingGroupsForDate,
    getEmptyAutoscalingGroups,
    processAutoscalingDimensions,
    getAutoscalingDimensionDetails,
    countEmptyAutoscalingGroups
};
