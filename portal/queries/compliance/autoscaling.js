async function getLatestAutoscalingDate(req) {
    return await req.collection("autoscaling_groups").findOne({}, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { year: -1, month: -1, day: -1 }
    });
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
            "Configuration.configuration.instances": { $size: 0 }
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

    const results = await req.getDetailsForAllAccounts();
    const asgCursor = await getAutoscalingGroupsForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

    let docCount = 0;
    let debugCount = 0;

    for await (const doc of asgCursor) {
        docCount++;

        // Debug first 3 documents
        if (debugCount < 3) {
            console.log('--- ASG Document Debug ---');
            console.log('account_id:', doc.account_id);
            console.log('Configuration exists:', !!doc.Configuration);
            console.log('Configuration.configuration exists:', !!doc.Configuration?.configuration);
            console.log('Configuration keys:', Object.keys(doc.Configuration || {}));
            if (doc.Configuration?.configuration) {
                console.log('Configuration.configuration keys:', Object.keys(doc.Configuration.configuration));
                console.log('MinSize:', doc.Configuration.configuration.MinSize);
                console.log('MaxSize:', doc.Configuration.configuration.MaxSize);
                console.log('DesiredCapacity:', doc.Configuration.configuration.DesiredCapacity);
            }
            console.log('--------------------------');
            debugCount++;
        }

        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);

        if (doc.Configuration?.configuration) {
            const min = doc.Configuration.configuration.minSize || 0;
            const max = doc.Configuration.configuration.maxSize || 0;
            const desired = doc.Configuration.configuration.desiredCapacity || 0;
            const key = `${min}-${max}-${desired}`;
            recs.forEach(rec => rec.dimensions.set(key, (rec.dimensions.get(key) || 0) + 1));
        }
    }

    console.log('ASG processAutoscalingDimensions: Total documents processed:', docCount);
    console.log('ASG processAutoscalingDimensions: Teams found:', Array.from(teamDimensions.keys()));

    return teamDimensions;
}

async function getAutoscalingDimensionDetails(req, params) {
    const { year, month, day, team, min, max, desired } = params;
    const allResources = [];

    const results = await req.getDetailsForAllAccounts();
    const asgCursor = await getAutoscalingGroupsForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

    for await (const doc of asgCursor) {
        if (!results.findByAccountId(doc.account_id).teams.find(t => t === team)) continue;

        if (doc.Configuration?.configuration) {
            const docMin = doc.Configuration.configuration.minSize || 0;
            const docMax = doc.Configuration.configuration.maxSize || 0;
            const docDesired = doc.Configuration.configuration.desiredCapacity || 0;

            if (docMin == min && docMax == max && docDesired == desired) {
                allResources.push({
                    resourceId: doc.resource_id,
                    shortName: doc.Configuration.configuration.autoScalingGroupName || doc.resource_id,
                    accountId: doc.account_id,
                    dimensions: {
                        min: docMin,
                        max: docMax,
                        desired: docDesired
                    },
                    details: {
                        launchTemplate: doc.Configuration.configuration.launchTemplate?.launchTemplateName ||
                                      doc.Configuration.configuration.launchConfigurationName || "N/A",
                        instanceCount: (doc.Configuration.configuration.instances || []).length || 0,
                        healthCheckType: doc.Configuration.configuration.healthCheckType || "Unknown",
                        healthCheckGracePeriod: doc.Configuration.configuration.healthCheckGracePeriod || 0,
                        availabilityZones: (doc.Configuration.configuration.availabilityZones || []).join(", ") || "N/A",
                        vpcZones: doc.Configuration.configuration.vpczoneIdentifier || "N/A",
                        targetGroups: (doc.Configuration.configuration.targetGroupARNs || []).length || 0,
                        createdTime: doc.Configuration.configuration.createdTime,
                        status: "Active"
                    }
                });
            }
        }
    }

    return allResources;
}

async function countEmptyAutoscalingGroups(req, year, month, day) {
    const teamCounts = new Map();

    const results = await req.getDetailsForAllAccounts();
    const asgCursor = await getEmptyAutoscalingGroups(req, year, month, day);

    for await (const doc of asgCursor) {
        const accountDetails = results.findByAccountId(doc.account_id);
        if (accountDetails && Array.isArray(accountDetails.teams)) {
            accountDetails.teams.forEach(team => teamCounts.set(team, (teamCounts.get(team) || 0) + 1));
        }
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
