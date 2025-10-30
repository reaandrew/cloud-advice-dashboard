const { mandatoryTags } = require('../../utils/shared');
const config = require('../../libs/config-loader');

/**
 * Get the latest date from a collection
 */
async function getLatestDate(req, collectionName) {
    const collection = await req.collection(collectionName);
    return await collection.findOne({}, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { year: -1, month: -1, day: -1 }
    });
}

/**
 * Aggregate tagging compliance by team
 */
async function aggregateTaggingByTeam(req, year, month, day) {
    const teamStats = new Map();
    const collection = await req.collection("tags");
    const cursor = collection.find({ year, month, day });

    const isMissing = v => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
    const bucketStartsWithAccountId = arn => /^\d{12}/.test((arn.split(":::")[1] || ""));
    const results = await req.getDetailsForAllAccounts();
    const seenResources = new Map(); // Track unique resources per team

    for await (const doc of cursor) {
        if (doc.resource_type === "bucket" && bucketStartsWithAccountId(doc.resource_id)) continue;

        const accountDetails = results.findByAccountId(doc.account_id);
        const teams = accountDetails.teams || [];

        if (teams.length === 0) continue;

        const uniqueKey = `${doc.account_id}-${doc.resource_id}`;

        // Process each team for this account
        for (const team of teams) {
            if (!team) continue;

            if (!teamStats.has(team)) {
                teamStats.set(team, {
                    teamName: team,
                    totalResources: 0,
                    nonCompliantResources: 0,
                    missingTagsByTag: new Map(),
                    _seenResources: new Set()
                });
            }

            const stats = teamStats.get(team);

            // Only count each resource once per team
            if (stats._seenResources.has(uniqueKey)) continue;
            stats._seenResources.add(uniqueKey);
            stats.totalResources++;

            // Check tags
            const tags = {};
            if (doc.Tags && Array.isArray(doc.Tags)) {
                for (const tag of doc.Tags) {
                    if (tag.Key && tag.Value !== undefined) {
                        tags[tag.Key.toLowerCase()] = tag.Value;
                    }
                }
            }

            let hasAnyMissingTag = false;
            for (const originalTagName of mandatoryTags) {
                const tagName = originalTagName.toLowerCase();
                let tagMissing = false;

                if (originalTagName === "BSP") {
                    const hasBillingID = !isMissing(tags["billingid"]);
                    const hasService = !isMissing(tags["service"]);
                    const hasProject = !isMissing(tags["project"]);
                    tagMissing = !(hasBillingID && (hasService || hasProject));
                } else {
                    tagMissing = isMissing(tags[tagName]);
                }

                if (tagMissing) {
                    hasAnyMissingTag = true;
                    const count = stats.missingTagsByTag.get(originalTagName) || 0;
                    stats.missingTagsByTag.set(originalTagName, count + 1);
                }
            }

            if (hasAnyMissingTag) {
                stats.nonCompliantResources++;
            }
        }
    }

    // Clean up internal tracking
    for (const [_, stats] of teamStats) {
        delete stats._seenResources;
    }

    return teamStats;
}

/**
 * Aggregate database compliance by team
 */
async function aggregateDatabaseByTeam(req, year, month, day) {
    const teamStats = new Map();
    const results = await req.getDetailsForAllAccounts();
    const deprecatedVersions = config.get('compliance.database.deprecated_versions', {});

    // Process RDS instances
    const rdsCollection = await req.collection("rds");
    const rdsCursor = rdsCollection.find({ year, month, day });

    for await (const doc of rdsCursor) {
        const accountDetails = results.findByAccountId(doc.account_id);
        const teams = accountDetails.teams || [];

        for (const team of teams) {
            if (!team) continue;

            if (!teamStats.has(team)) {
                teamStats.set(team, {
                    teamName: team,
                    totalDatabases: 0,
                    deprecatedDatabases: 0
                });
            }

            const stats = teamStats.get(team);
            stats.totalDatabases++;

            // Check for deprecation
            const engine = doc.Engine || 'unknown';
            const version = doc.EngineVersion || '';
            if (deprecatedVersions[engine]) {
                for (const deprecated of deprecatedVersions[engine]) {
                    if (version.startsWith(deprecated.version) || version.includes(deprecated.version)) {
                        stats.deprecatedDatabases++;
                        break;
                    }
                }
            }
        }
    }

    // Process Redshift clusters
    const redshiftCollection = await req.collection("redshift_clusters");
    const redshiftCursor = redshiftCollection.find({ year, month, day });

    for await (const doc of redshiftCursor) {
        const accountDetails = results.findByAccountId(doc.account_id);
        const teams = accountDetails.teams || [];

        for (const team of teams) {
            if (!team) continue;

            if (!teamStats.has(team)) {
                teamStats.set(team, {
                    teamName: team,
                    totalDatabases: 0,
                    deprecatedDatabases: 0
                });
            }

            const stats = teamStats.get(team);
            stats.totalDatabases++;
        }
    }

    return teamStats;
}

/**
 * Aggregate load balancer compliance by team
 */
async function aggregateLoadBalancersByTeam(req, year, month, day) {
    const teamStats = new Map();
    const results = await req.getDetailsForAllAccounts();

    // Process ELB v2 (ALB/NLB)
    const elbV2Collection = await req.collection("elb_v2");
    const elbV2Cursor = elbV2Collection.find({ year, month, day });

    for await (const doc of elbV2Cursor) {
        const accountDetails = results.findByAccountId(doc.account_id);
        const teams = accountDetails.teams || [];

        for (const team of teams) {
            if (!team) continue;

            if (!teamStats.has(team)) {
                teamStats.set(team, {
                    teamName: team,
                    totalLoadBalancers: 0,
                    albCount: 0,
                    nlbCount: 0,
                    classicCount: 0,
                    secureLoadBalancers: 0
                });
            }

            const stats = teamStats.get(team);
            stats.totalLoadBalancers++;

            const lbType = doc.Type || 'unknown';
            if (lbType === 'application') stats.albCount++;
            else if (lbType === 'network') stats.nlbCount++;
        }
    }

    // Get listeners to check for HTTPS/TLS
    const listenersCollection = await req.collection("elb_v2_listeners");
    const listenersCursor = listenersCollection.find({ year, month, day });
    const secureLoadBalancers = new Set();

    for await (const doc of listenersCursor) {
        if (doc.Protocol === 'HTTPS' || doc.Protocol === 'TLS') {
            secureLoadBalancers.add(doc.LoadBalancerArn);
        }
    }

    // Count secure load balancers per team
    const elbV2Cursor2 = elbV2Collection.find({ year, month, day });
    for await (const doc of elbV2Cursor2) {
        if (secureLoadBalancers.has(doc.LoadBalancerArn)) {
            const accountDetails = results.findByAccountId(doc.account_id);
            const teams = accountDetails.teams || [];

            for (const team of teams) {
                if (!team) continue;
                const stats = teamStats.get(team);
                if (stats) stats.secureLoadBalancers++;
            }
        }
    }

    // Process Classic ELBs
    const classicCollection = await req.collection("elb_classic");
    const classicCursor = classicCollection.find({ year, month, day });

    for await (const doc of classicCursor) {
        const accountDetails = results.findByAccountId(doc.account_id);
        const teams = accountDetails.teams || [];

        for (const team of teams) {
            if (!team) continue;

            if (!teamStats.has(team)) {
                teamStats.set(team, {
                    teamName: team,
                    totalLoadBalancers: 0,
                    albCount: 0,
                    nlbCount: 0,
                    classicCount: 0,
                    secureLoadBalancers: 0
                });
            }

            const stats = teamStats.get(team);
            stats.totalLoadBalancers++;
            stats.classicCount++;

            // Check for HTTPS listeners
            if (doc.ListenerDescriptions && Array.isArray(doc.ListenerDescriptions)) {
                const hasHttps = doc.ListenerDescriptions.some(ld =>
                    ld.Listener && (ld.Listener.Protocol === 'HTTPS' || ld.Listener.Protocol === 'SSL')
                );
                if (hasHttps) stats.secureLoadBalancers++;
            }
        }
    }

    return teamStats;
}

/**
 * Aggregate KMS key compliance by team
 */
async function aggregateKmsByTeam(req, year, month, day) {
    const teamStats = new Map();
    const results = await req.getDetailsForAllAccounts();
    const collection = await req.collection("kms_key_metadata");
    const cursor = collection.find({ year, month, day });

    for await (const doc of cursor) {
        const accountDetails = results.findByAccountId(doc.account_id);
        const teams = accountDetails.teams || [];

        for (const team of teams) {
            if (!team) continue;

            if (!teamStats.has(team)) {
                teamStats.set(team, {
                    teamName: team,
                    totalKeys: 0,
                    keysWithRotation: 0
                });
            }

            const stats = teamStats.get(team);
            stats.totalKeys++;

            if (doc.KeyRotationEnabled === true) {
                stats.keysWithRotation++;
            }
        }
    }

    return teamStats;
}

/**
 * Aggregate auto scaling compliance by team
 */
async function aggregateAutoScalingByTeam(req, year, month, day) {
    const teamStats = new Map();
    const results = await req.getDetailsForAllAccounts();
    const collection = await req.collection("autoscaling_groups");
    const cursor = collection.find({ year, month, day });

    for await (const doc of cursor) {
        const accountDetails = results.findByAccountId(doc.account_id);
        const teams = accountDetails.teams || [];

        for (const team of teams) {
            if (!team) continue;

            if (!teamStats.has(team)) {
                teamStats.set(team, {
                    teamName: team,
                    totalAsgs: 0,
                    emptyAsgs: 0
                });
            }

            const stats = teamStats.get(team);
            stats.totalAsgs++;

            const instances = doc.Instances || [];
            if (instances.length === 0) {
                stats.emptyAsgs++;
            }
        }
    }

    return teamStats;
}

/**
 * Get comprehensive team summary across all compliance types
 */
async function getTeamSummary(req) {
    // Get latest dates for each collection
    const tagsDate = await getLatestDate(req, "tags");
    const rdsDate = await getLatestDate(req, "rds");
    const elbDate = await getLatestDate(req, "elb_v2");
    const kmsDate = await getLatestDate(req, "kms_key_metadata");
    const asgDate = await getLatestDate(req, "autoscaling_groups");

    // Aggregate data by team for each compliance type
    const [tagging, database, loadbalancers, kms, autoscaling] = await Promise.all([
        tagsDate ? aggregateTaggingByTeam(req, tagsDate.year, tagsDate.month, tagsDate.day) : new Map(),
        rdsDate ? aggregateDatabaseByTeam(req, rdsDate.year, rdsDate.month, rdsDate.day) : new Map(),
        elbDate ? aggregateLoadBalancersByTeam(req, elbDate.year, elbDate.month, elbDate.day) : new Map(),
        kmsDate ? aggregateKmsByTeam(req, kmsDate.year, kmsDate.month, kmsDate.day) : new Map(),
        asgDate ? aggregateAutoScalingByTeam(req, asgDate.year, asgDate.month, asgDate.day) : new Map()
    ]);

    // Combine all team names
    const allTeamNames = new Set([
        ...tagging.keys(),
        ...database.keys(),
        ...loadbalancers.keys(),
        ...kms.keys(),
        ...autoscaling.keys()
    ]);

    // Build comprehensive summary
    const teamSummaries = [];
    for (const teamName of allTeamNames) {
        const taggingData = tagging.get(teamName) || {};
        const databaseData = database.get(teamName) || {};
        const lbData = loadbalancers.get(teamName) || {};
        const kmsData = kms.get(teamName) || {};
        const asgData = autoscaling.get(teamName) || {};

        teamSummaries.push({
            teamName: teamName,
            tagging: {
                totalResources: taggingData.totalResources || 0,
                nonCompliantResources: taggingData.nonCompliantResources || 0,
                complianceRate: taggingData.totalResources > 0
                    ? ((taggingData.totalResources - taggingData.nonCompliantResources) / taggingData.totalResources * 100).toFixed(1)
                    : 'N/A'
            },
            database: {
                totalDatabases: databaseData.totalDatabases || 0,
                deprecatedDatabases: databaseData.deprecatedDatabases || 0,
                currentVersions: databaseData.totalDatabases > 0
                    ? databaseData.totalDatabases - databaseData.deprecatedDatabases
                    : 0
            },
            loadbalancers: {
                totalLoadBalancers: lbData.totalLoadBalancers || 0,
                secureLoadBalancers: lbData.secureLoadBalancers || 0,
                albCount: lbData.albCount || 0,
                nlbCount: lbData.nlbCount || 0,
                classicCount: lbData.classicCount || 0,
                secureRate: lbData.totalLoadBalancers > 0
                    ? (lbData.secureLoadBalancers / lbData.totalLoadBalancers * 100).toFixed(1)
                    : 'N/A'
            },
            kms: {
                totalKeys: kmsData.totalKeys || 0,
                keysWithRotation: kmsData.keysWithRotation || 0,
                rotationRate: kmsData.totalKeys > 0
                    ? (kmsData.keysWithRotation / kmsData.totalKeys * 100).toFixed(1)
                    : 'N/A'
            },
            autoscaling: {
                totalAsgs: asgData.totalAsgs || 0,
                emptyAsgs: asgData.emptyAsgs || 0,
                activeAsgs: asgData.totalAsgs > 0
                    ? asgData.totalAsgs - asgData.emptyAsgs
                    : 0
            }
        });
    }

    // Sort by team name
    teamSummaries.sort((a, b) => a.teamName.localeCompare(b.teamName));

    return {
        teams: teamSummaries
    };
}

module.exports = {
    getTeamSummary,
    aggregateTaggingByTeam,
    aggregateDatabaseByTeam,
    aggregateLoadBalancersByTeam,
    aggregateKmsByTeam,
    aggregateAutoScalingByTeam
};
