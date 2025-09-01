const { accountIdToTeam } = require('../../utils/shared');

const dbName = 'aws_data';

async function getLatestAutoscalingDate(client) {
    const db = client.db(dbName);
    return await db.collection("autoscaling_groups").findOne({}, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { year: -1, month: -1, day: -1 }
    });
}

async function getAutoscalingGroupsForDate(client, year, month, day, projection = null) {
    const db = client.db(dbName);
    return db.collection("autoscaling_groups").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});
}

async function getEmptyAutoscalingGroups(client, year, month, day) {
    const db = client.db(dbName);
    return db.collection("autoscaling_groups").find(
        {
            year: year,
            month: month,
            day: day,
            "Configuration.Instances": { $size: 0 }
        },
        { projection: { account_id: 1 } }
    );
}

async function processAutoscalingDimensions(client, year, month, day) {
    const teamDimensions = new Map();

    const ensureTeam = t => {
        if (!teamDimensions.has(t))
            teamDimensions.set(t, { dimensions: new Map() });
        return teamDimensions.get(t);
    };

    const asgCursor = await getAutoscalingGroupsForDate(client, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of asgCursor) {
        const team = accountIdToTeam[doc.account_id] || "Unknown";
        const rec = ensureTeam(team);

        if (doc.Configuration) {
            const min = doc.Configuration.MinSize || 0;
            const max = doc.Configuration.MaxSize || 0;
            const desired = doc.Configuration.DesiredCapacity || 0;
            const key = `${min}-${max}-${desired}`;
            rec.dimensions.set(key, (rec.dimensions.get(key) || 0) + 1);
        }
    }

    return teamDimensions;
}

async function getAutoscalingDimensionDetails(client, year, month, day, team, min, max, desired) {
    const allResources = [];

    const asgCursor = await getAutoscalingGroupsForDate(client, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

    for await (const doc of asgCursor) {
        const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
        if (docTeam !== team) continue;

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

async function countEmptyAutoscalingGroups(client, year, month, day) {
    const teamCounts = new Map();

    const asgCursor = await getEmptyAutoscalingGroups(client, year, month, day);

    for await (const doc of asgCursor) {
        const team = accountIdToTeam[doc.account_id] || "Unknown";
        teamCounts.set(team, (teamCounts.get(team) || 0) + 1);
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