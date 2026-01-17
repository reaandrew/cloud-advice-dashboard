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

    // Debug counter to limit log volume
    let debugCount = 0;

    for await (const doc of asgCursor) {
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);

        // Debug logging for the first few documents to understand structure
        if (debugCount < 3) {
            console.log('--- ASG Document Structure Debug ---');
            console.log('doc exists:', !!doc);
            console.log('Configuration exists:', !!doc?.Configuration);
            console.log('Configuration.configuration exists:', !!doc?.Configuration?.configuration);
            console.log('Configuration.MinSize exists:', !!doc?.Configuration?.MinSize);
            console.log('Configuration.configuration.MinSize exists:', !!doc?.Configuration?.configuration?.MinSize);
            console.log('Keys at root level:', Object.keys(doc || {}));
            console.log('Keys in Configuration:', Object.keys(doc?.Configuration || {}));
            if (doc?.Configuration?.configuration) {
                console.log('Keys in Configuration.configuration:', Object.keys(doc.Configuration.configuration));
            }
            console.log('----------------------------------');
            debugCount++;
        }

        if (doc.Configuration?.configuration) {
            // Use correct capitalization for AWS Config fields
            const min = doc.Configuration.configuration.MinSize || 0;
            const max = doc.Configuration.configuration.MaxSize || 0;
            const desired = doc.Configuration.configuration.DesiredCapacity || 0;
            const key = `${min}-${max}-${desired}`;
            recs.forEach(rec => rec.dimensions.set(key, (rec.dimensions.get(key) || 0) + 1));
        }
    }

    return teamDimensions;
}

async function getAutoscalingDimensionDetails(req, params) {
    const { year, month, day, team, min, max, desired } = params;
    const allResources = [];

    const results = await req.getDetailsForAllAccounts();

    const asgCursor = await getAutoscalingGroupsForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

    // Debug counter to limit log volume
    let debugDetailCount = 0;

    for await (const doc of asgCursor) {
        if (!results.findByAccountId(doc.account_id).teams.find(t => t === team)) continue;

        // Debug logging for the first few documents to understand structure in detail view
        if (debugDetailCount < 2) {
            console.log('--- ASG Detail Document Structure Debug ---');
            console.log('doc exists:', !!doc);
            console.log('Configuration exists:', !!doc?.Configuration);
            console.log('Configuration.configuration exists:', !!doc?.Configuration?.configuration);
            console.log('Configuration fields direct access test:');

            // Try both paths to see which one contains the data
            // Check both capitalization styles to determine what's in the data
            const directCamelCase = {
                minSize: doc?.Configuration?.minSize,
                maxSize: doc?.Configuration?.maxSize,
                desiredCapacity: doc?.Configuration?.desiredCapacity,
                autoScalingGroupName: doc?.Configuration?.autoScalingGroupName,
                instances: doc?.Configuration?.instances ? 'exists' : 'missing'
            };

            const directPascalCase = {
                minSize: doc?.Configuration?.MinSize,
                maxSize: doc?.Configuration?.MaxSize,
                desiredCapacity: doc?.Configuration?.DesiredCapacity,
                autoScalingGroupName: doc?.Configuration?.AutoScalingGroupName,
                instances: doc?.Configuration?.Instances ? 'exists' : 'missing'
            };

            const nestedCamelCase = {
                minSize: doc?.Configuration?.configuration?.minSize,
                maxSize: doc?.Configuration?.configuration?.maxSize,
                desiredCapacity: doc?.Configuration?.configuration?.desiredCapacity,
                autoScalingGroupName: doc?.Configuration?.configuration?.autoScalingGroupName,
                instances: doc?.Configuration?.configuration?.instances ? 'exists' : 'missing'
            };

            const nestedPascalCase = {
                minSize: doc?.Configuration?.configuration?.MinSize,
                maxSize: doc?.Configuration?.configuration?.MaxSize,
                desiredCapacity: doc?.Configuration?.configuration?.DesiredCapacity,
                autoScalingGroupName: doc?.Configuration?.configuration?.AutoScalingGroupName,
                instances: doc?.Configuration?.configuration?.Instances ? 'exists' : 'missing'
            };

            console.log('Structure via direct Configuration access (camelCase):',
                        Object.keys(directCamelCase).map(k => `${k}: ${directCamelCase[k] !== undefined ? 'exists' : 'missing'}`));

            console.log('Structure via direct Configuration access (PascalCase):',
                        Object.keys(directPascalCase).map(k => `${k}: ${directPascalCase[k] !== undefined ? 'exists' : 'missing'}`));

            console.log('Structure via Configuration.configuration access (camelCase):',
                        Object.keys(nestedCamelCase).map(k => `${k}: ${nestedCamelCase[k] !== undefined ? 'exists' : 'missing'}`));

            console.log('Structure via Configuration.configuration access (PascalCase):',
                        Object.keys(nestedPascalCase).map(k => `${k}: ${nestedPascalCase[k] !== undefined ? 'exists' : 'missing'}`));

            console.log('----------------------------------');
            debugDetailCount++;
        }

        if (doc.Configuration?.configuration) {
            // Use correct capitalization for AWS Config fields
            const docMin = doc.Configuration.configuration.MinSize || 0;
            const docMax = doc.Configuration.configuration.MaxSize || 0;
            const docDesired = doc.Configuration.configuration.DesiredCapacity || 0;

            if (docMin == min && docMax == max && docDesired == desired) {
                allResources.push({
                    resourceId: doc.resource_id,
                    shortName: doc.Configuration?.configuration?.AutoScalingGroupName || doc.resource_id,
                    accountId: doc.account_id,
                    dimensions: {
                        min: docMin,
                        max: docMax,
                        desired: docDesired
                    },
                    details: {
                        launchTemplate: doc.Configuration?.configuration?.LaunchTemplate?.LaunchTemplateName ||
                                      doc.Configuration?.configuration?.LaunchConfigurationName || "N/A",
                        instanceCount: (doc.Configuration?.configuration?.Instances || []).length || 0,
                        healthCheckType: doc.Configuration?.configuration?.HealthCheckType || "Unknown",
                        healthCheckGracePeriod: doc.Configuration?.configuration?.HealthCheckGracePeriod || 0,
                        availabilityZones: (doc.Configuration?.configuration?.AvailabilityZones || [])?.join(", ") || "N/A",
                        vpcZones: doc.Configuration?.configuration?.VPCZoneIdentifier || "N/A",
                        targetGroups: (doc.Configuration?.configuration?.TargetGroupARNs || [])?.length || 0,
                        createdTime: doc.Configuration?.configuration?.CreatedTime,
                        status: "Active" // Status isn't in the output, default to Active
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

    // Log the query used for debugging
    console.log('--- Empty ASG Query Debug ---');
    console.log('Empty ASG query:', {
        year: year,
        month: month,
        day: day,
        "Configuration.configuration.instances": { $size: 0 }
    });

    const asgCursor = await getEmptyAutoscalingGroups(req, year, month, day);

    // Debug counter to limit log volume
    let emptyDebugCount = 0;

    for await (const doc of asgCursor) {
        // Log document structure for the first few empty ASGs
        if (emptyDebugCount < 2) {
            console.log('--- Empty ASG Document Debug ---');
            console.log('Empty ASG doc structure:', {
                exists: !!doc,
                hasAccountId: !!doc?.account_id
            });
            emptyDebugCount++;
        }
        results.findByAccountId(doc.account_id).teams.forEach(team => teamCounts.set(team, (teamCounts.get(team) || 0) + 1));
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
