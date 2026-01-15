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
 * Aggregate tagging compliance by tenant
 */
async function aggregateTaggingByTenant(req, year, month, day) {
    const tenantStats = new Map();
    const collection = await req.collection("tags");
    const cursor = collection.find({ year, month, day });

    const isMissing = v => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
    const bucketStartsWithAccountId = arn => /^\d{12}/.test((arn.split(":::")[1] || ""));
    const results = await req.getDetailsForAllAccounts();
    const seenResources = new Map(); // Track unique resources per tenant

    for await (const doc of cursor) {
        if (doc.resource_type === "bucket" && bucketStartsWithAccountId(doc.resource_id)) continue;

        const accountDetails = results.findByAccountId(doc.account_id);
        const tenants = accountDetails.tenants || [];

        if (tenants.length === 0) continue;

        const uniqueKey = `${doc.account_id}-${doc.resource_id}`;

        // Process each tenant for this account
        for (const tenant of tenants) {
            const tenantId = tenant.Id || tenant.id;
            if (!tenantId) continue;

            if (!tenantStats.has(tenantId)) {
                tenantStats.set(tenantId, {
                    tenantId: tenantId,
                    tenantName: tenant.Name || tenant.name || tenantId,
                    tenantDescription: tenant.Description || tenant.description || '',
                    totalResources: 0,
                    nonCompliantResources: 0,
                    missingTagsByTag: new Map(),
                    _seenResources: new Set()
                });
            }

            const stats = tenantStats.get(tenantId);

            // Only count each resource once per tenant
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
    for (const [_, stats] of tenantStats) {
        delete stats._seenResources;
    }

    return tenantStats;
}

/**
 * Aggregate database compliance by tenant
 */
async function aggregateDatabaseByTenant(req, year, month, day) {
    const tenantStats = new Map();
    const results = await req.getDetailsForAllAccounts();
    const deprecatedVersions = config.get('compliance.database.deprecated_versions', {});

    // Process RDS instances
    const rdsCollection = await req.collection("rds");
    const rdsCursor = rdsCollection.find({ year, month, day });

    for await (const doc of rdsCursor) {
        const accountDetails = results.findByAccountId(doc.account_id);
        const tenants = accountDetails.tenants || [];

        for (const tenant of tenants) {
            const tenantId = tenant.Id || tenant.id;
            if (!tenantId) continue;

            if (!tenantStats.has(tenantId)) {
                tenantStats.set(tenantId, {
                    tenantId: tenantId,
                    tenantName: tenant.Name || tenant.name || tenantId,
                    totalDatabases: 0,
                    deprecatedDatabases: 0
                });
            }

            const stats = tenantStats.get(tenantId);
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
        const tenants = accountDetails.tenants || [];

        for (const tenant of tenants) {
            const tenantId = tenant.Id || tenant.id;
            if (!tenantId) continue;

            if (!tenantStats.has(tenantId)) {
                tenantStats.set(tenantId, {
                    tenantId: tenantId,
                    tenantName: tenant.Name || tenant.name || tenantId,
                    totalDatabases: 0,
                    deprecatedDatabases: 0
                });
            }

            const stats = tenantStats.get(tenantId);
            stats.totalDatabases++;
        }
    }

    return tenantStats;
}

/**
 * Aggregate load balancer compliance by tenant
 */
async function aggregateLoadBalancersByTenant(req, year, month, day) {
    const tenantStats = new Map();
    const results = await req.getDetailsForAllAccounts();

    // Process ELB v2 (ALB/NLB)
    const elbV2Collection = await req.collection("elb_v2");
    const elbV2Cursor = elbV2Collection.find({ year, month, day });

    for await (const doc of elbV2Cursor) {
        const accountDetails = results.findByAccountId(doc.account_id);
        const tenants = accountDetails.tenants || [];

        for (const tenant of tenants) {
            const tenantId = tenant.Id || tenant.id;
            if (!tenantId) continue;

            if (!tenantStats.has(tenantId)) {
                tenantStats.set(tenantId, {
                    tenantId: tenantId,
                    tenantName: tenant.Name || tenant.name || tenantId,
                    totalLoadBalancers: 0,
                    albCount: 0,
                    nlbCount: 0,
                    classicCount: 0,
                    secureLoadBalancers: 0
                });
            }

            const stats = tenantStats.get(tenantId);
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

    // Count secure load balancers per tenant
    const elbV2Cursor2 = elbV2Collection.find({ year, month, day });
    for await (const doc of elbV2Cursor2) {
        if (secureLoadBalancers.has(doc.LoadBalancerArn)) {
            const accountDetails = results.findByAccountId(doc.account_id);
            const tenants = accountDetails.tenants || [];

            for (const tenant of tenants) {
                const tenantId = tenant.Id || tenant.id;
                if (!tenantId) continue;
                const stats = tenantStats.get(tenantId);
                if (stats) stats.secureLoadBalancers++;
            }
        }
    }

    // Process Classic ELBs
    const classicCollection = await req.collection("elb_classic");
    const classicCursor = classicCollection.find({ year, month, day });

    for await (const doc of classicCursor) {
        const accountDetails = results.findByAccountId(doc.account_id);
        const tenants = accountDetails.tenants || [];

        for (const tenant of tenants) {
            const tenantId = tenant.Id || tenant.id;
            if (!tenantId) continue;

            if (!tenantStats.has(tenantId)) {
                tenantStats.set(tenantId, {
                    tenantId: tenantId,
                    tenantName: tenant.Name || tenant.name || tenantId,
                    totalLoadBalancers: 0,
                    albCount: 0,
                    nlbCount: 0,
                    classicCount: 0,
                    secureLoadBalancers: 0
                });
            }

            const stats = tenantStats.get(tenantId);
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

    return tenantStats;
}

/**
 * Aggregate KMS key compliance by tenant
 */
async function aggregateKmsByTenant(req, year, month, day) {
    const tenantStats = new Map();
    const results = await req.getDetailsForAllAccounts();
    const collection = await req.collection("kms_key_metadata");
    const cursor = collection.find({ year, month, day });

    for await (const doc of cursor) {
        const accountDetails = results.findByAccountId(doc.account_id);
        const tenants = accountDetails.tenants || [];

        for (const tenant of tenants) {
            const tenantId = tenant.Id || tenant.id;
            if (!tenantId) continue;

            if (!tenantStats.has(tenantId)) {
                tenantStats.set(tenantId, {
                    tenantId: tenantId,
                    tenantName: tenant.Name || tenant.name || tenantId,
                    totalKeys: 0,
                    keysWithRotation: 0
                });
            }

            const stats = tenantStats.get(tenantId);
            stats.totalKeys++;

            if (doc.KeyRotationEnabled === true) {
                stats.keysWithRotation++;
            }
        }
    }

    return tenantStats;
}

/**
 * Aggregate auto scaling compliance by tenant
 */
async function aggregateAutoScalingByTenant(req, year, month, day) {
    const tenantStats = new Map();
    const results = await req.getDetailsForAllAccounts();
    const collection = await req.collection("autoscaling_groups");
    const cursor = collection.find({ year, month, day });

    for await (const doc of cursor) {
        const accountDetails = results.findByAccountId(doc.account_id);
        const tenants = accountDetails.tenants || [];

        for (const tenant of tenants) {
            const tenantId = tenant.Id || tenant.id;
            if (!tenantId) continue;

            if (!tenantStats.has(tenantId)) {
                tenantStats.set(tenantId, {
                    tenantId: tenantId,
                    tenantName: tenant.Name || tenant.name || tenantId,
                    totalAsgs: 0,
                    emptyAsgs: 0
                });
            }

            const stats = tenantStats.get(tenantId);
            stats.totalAsgs++;

            const instances = doc.Configuration?.Instances || [];
            if (instances.length === 0) {
                stats.emptyAsgs++;
            }
        }
    }

    return tenantStats;
}

/**
 * Get comprehensive tenant summary across all compliance types
 */
async function getTenantSummary(req) {
    // Get latest dates for each collection
    const tagsDate = await getLatestDate(req, "tags");
    const rdsDate = await getLatestDate(req, "rds");
    const elbDate = await getLatestDate(req, "elb_v2");
    const kmsDate = await getLatestDate(req, "kms_key_metadata");
    const asgDate = await getLatestDate(req, "autoscaling_groups");

    // Aggregate data by tenant for each compliance type
    const [tagging, database, loadbalancers, kms, autoscaling] = await Promise.all([
        tagsDate ? aggregateTaggingByTenant(req, tagsDate.year, tagsDate.month, tagsDate.day) : new Map(),
        rdsDate ? aggregateDatabaseByTenant(req, rdsDate.year, rdsDate.month, rdsDate.day) : new Map(),
        elbDate ? aggregateLoadBalancersByTenant(req, elbDate.year, elbDate.month, elbDate.day) : new Map(),
        kmsDate ? aggregateKmsByTenant(req, kmsDate.year, kmsDate.month, kmsDate.day) : new Map(),
        asgDate ? aggregateAutoScalingByTenant(req, asgDate.year, asgDate.month, asgDate.day) : new Map()
    ]);

    // Combine all tenant IDs
    const allTenantIds = new Set([
        ...tagging.keys(),
        ...database.keys(),
        ...loadbalancers.keys(),
        ...kms.keys(),
        ...autoscaling.keys()
    ]);

    // Build comprehensive summary
    const tenantSummaries = [];
    for (const tenantId of allTenantIds) {
        const taggingData = tagging.get(tenantId) || {};
        const databaseData = database.get(tenantId) || {};
        const lbData = loadbalancers.get(tenantId) || {};
        const kmsData = kms.get(tenantId) || {};
        const asgData = autoscaling.get(tenantId) || {};

        tenantSummaries.push({
            tenantId: tenantId,
            tenantName: taggingData.tenantName || databaseData.tenantName || lbData.tenantName || kmsData.tenantName || asgData.tenantName || tenantId,
            tenantDescription: taggingData.tenantDescription || '',
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

    // Sort by tenant name
    tenantSummaries.sort((a, b) => a.tenantName.localeCompare(b.tenantName));

    return {
        tenants: tenantSummaries,
        dates: {
            tagging: tagsDate,
            database: rdsDate,
            loadbalancers: elbDate,
            kms: kmsDate,
            autoscaling: asgDate
        }
    };
}

module.exports = {
    getTenantSummary,
    aggregateTaggingByTenant,
    aggregateDatabaseByTenant,
    aggregateLoadBalancersByTenant,
    aggregateKmsByTenant,
    aggregateAutoScalingByTenant
};
