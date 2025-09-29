const { mandatoryTags } = require('../../utils/shared');
const { get } = require('../../libs/config-loader');
const { getLatestDateAcrossCollections } = require('../../utils/getLatestDate');

async function getLatestDate(req) {
    // Get the latest date across all collections
    const collections = ['tags', 'elb_v2', 'rds', 'kms_keys'];
    return getLatestDateAcrossCollections(req, collections);
}

async function getOverallCompliancePercentage(req, year, month, day) {
    const tagsCollection = req.collection("tags");
    
    const totalResourcesCursor = await tagsCollection.find({
        year: year,
        month: month,
        day: day
    });
    
    let totalResources = 0;
    let compliantResources = 0;
    
    for await (const doc of totalResourcesCursor) {
        totalResources++;
        
        const tags = doc.Tags || {};
        const hasAllMandatoryTags = mandatoryTags.every(tag => {
            if (tag === 'BSP') {
                // BSP requires BillingID and (Service OR Project)
                return tags.BillingID && (tags.Service || tags.Project);
            }
            return tags[tag];
        });
        
        if (hasAllMandatoryTags) {
            compliantResources++;
        }
    }
    
    return totalResources === 0 ? 0 : Math.round((compliantResources / totalResources) * 100);
}

async function getSecureLoadBalancersPercentage(req, year, month, day) {
    const elbV2Collection = req.collection("elb_v2");
    const elbClassicCollection = req.collection("elb_classic");
    const listenersCollection = req.collection("elb_v2_listeners");
    
    let totalLBs = 0;
    let secureLBs = 0;
    
    // Check ELB v2 with HTTPS listeners
    const elbV2Cursor = await elbV2Collection.find({
        year: year,
        month: month,
        day: day
    });
    
    const elbV2Map = new Map();
    for await (const doc of elbV2Cursor) {
        totalLBs++;
        elbV2Map.set(doc.resource_id, doc);
    }
    
    // Check listeners for HTTPS/TLS protocols
    const listenersCursor = await listenersCollection.find({
        year: year,
        month: month,
        day: day
    });
    
    const secureElbV2 = new Set();
    for await (const doc of listenersCursor) {
        const protocol = doc.Configuration?.Protocol;
        if (protocol === "HTTPS" || protocol === "TLS") {
            secureElbV2.add(doc.LoadBalancerArn);
        }
    }
    
    secureLBs += secureElbV2.size;
    
    // Check Classic ELBs with HTTPS listeners
    const elbClassicCursor = await elbClassicCollection.find({
        year: year,
        month: month,
        day: day
    });
    
    for await (const doc of elbClassicCursor) {
        totalLBs++;
        const listeners = doc.Configuration?.ListenerDescriptions || [];
        const hasSecureListener = listeners.some(listener => 
            listener.Listener?.Protocol === "HTTPS" || 
            listener.Listener?.Protocol === "SSL"
        );
        if (hasSecureListener) {
            secureLBs++;
        }
    }
    
    return totalLBs === 0 ? 0 : Math.round((secureLBs / totalLBs) * 100);
}

async function getCurrentDbVersionsPercentage(req, year, month, day) {
    const rdsCollection = req.collection("rds");
    const redshiftCollection = req.collection("redshift_clusters");
    
    const deprecatedVersions = get('compliance.database.deprecated_versions', {});
    
    let totalDbs = 0;
    let currentDbs = 0;
    
    // Check RDS instances
    const rdsCursor = await rdsCollection.find({
        year: year,
        month: month,
        day: day
    });
    
    for await (const doc of rdsCursor) {
        if (!doc.Configuration) continue;
        
        totalDbs++;
        const engine = doc.Configuration.Engine || "Unknown";
        const version = doc.Configuration.EngineVersion || "Unknown";
        
        let isDeprecated = false;
        if (deprecatedVersions[engine]) {
            for (const deprecated of deprecatedVersions[engine]) {
                if (version.startsWith(deprecated.version) || version.includes(deprecated.version)) {
                    isDeprecated = true;
                    break;
                }
            }
        }
        
        if (!isDeprecated) {
            currentDbs++;
        }
    }
    
    // Check Redshift clusters
    const redshiftCursor = await redshiftCollection.find({
        year: year,
        month: month,
        day: day
    });
    
    for await (const doc of redshiftCursor) {
        if (!doc.Configuration) continue;
        
        totalDbs++;
        const version = doc.Configuration.ClusterVersion || "Unknown";
        
        let isDeprecated = false;
        if (deprecatedVersions.redshift) {
            for (const deprecated of deprecatedVersions.redshift) {
                if (version.startsWith(deprecated.version) || version.includes(deprecated.version)) {
                    isDeprecated = true;
                    break;
                }
            }
        }
        
        if (!isDeprecated) {
            currentDbs++;
        }
    }
    
    return totalDbs === 0 ? 0 : Math.round((currentDbs / totalDbs) * 100);
}

async function getKmsKeysWithRotationPercentage(req, year, month, day) {
    const kmsCollection = req.collection("kms_keys");
    
    let totalKeys = 0;
    let rotationEnabledKeys = 0;
    
    const kmsCursor = await kmsCollection.find({
        year: year,
        month: month,
        day: day
    });
    
    for await (const doc of kmsCursor) {
        if (!doc.Configuration) continue;
        
        totalKeys++;
        
        // Check if key rotation is enabled
        if (doc.Configuration.KeyRotationStatus === true || doc.Configuration.KeyRotationStatus === "Enabled") {
            rotationEnabledKeys++;
        }
    }
    
    return totalKeys === 0 ? 0 : Math.round((rotationEnabledKeys / totalKeys) * 100);
}

async function getActiveAlbsPercentage(req, year, month, day) {
    const elbV2Collection = req.collection("elb_v2");
    
    let totalAlbs = 0;
    let activeAlbs = 0;
    
    const elbV2Cursor = await elbV2Collection.find({
        year: year,
        month: month,
        day: day
    });
    
    for await (const doc of elbV2Cursor) {
        const type = doc.Configuration?.Type;
        if (type === "application") {
            totalAlbs++;
            const state = doc.Configuration?.State?.Code;
            if (state === "active") {
                activeAlbs++;
            }
        }
    }
    
    return totalAlbs === 0 ? 0 : Math.round((activeAlbs / totalAlbs) * 100);
}

async function getCorrectlyConfiguredAlbsPercentage(req, year, month, day) {
    const elbV2Collection = req.collection("elb_v2");
    const listenersCollection = req.collection("elb_v2_listeners");
    
    let totalAlbs = 0;
    let correctlyConfiguredAlbs = 0;
    
    // Get all ALBs
    const elbV2Cursor = await elbV2Collection.find({
        year: year,
        month: month,
        day: day
    });
    
    const albMap = new Map();
    for await (const doc of elbV2Cursor) {
        const type = doc.Configuration?.Type;
        if (type === "application") {
            totalAlbs++;
            albMap.set(doc.resource_id, {
                hasHttpsListener: false,
                isInternetFacing: doc.Configuration?.Scheme === "internet-facing"
            });
        }
    }
    
    // Check for HTTPS listeners
    const listenersCursor = await listenersCollection.find({
        year: year,
        month: month,
        day: day
    });
    
    for await (const doc of listenersCursor) {
        const albArn = doc.LoadBalancerArn;
        if (albMap.has(albArn)) {
            const protocol = doc.Configuration?.Protocol;
            if (protocol === "HTTPS") {
                albMap.get(albArn).hasHttpsListener = true;
            }
        }
    }
    
    // Count correctly configured ALBs (internet-facing ones should have HTTPS)
    for (const [arn, config] of albMap) {
        if (!config.isInternetFacing || config.hasHttpsListener) {
            correctlyConfiguredAlbs++;
        }
    }
    
    return totalAlbs === 0 ? 0 : Math.round((correctlyConfiguredAlbs / totalAlbs) * 100);
}

async function getModernLbsPercentage(req, year, month, day) {
    const elbV2Collection = req.collection("elb_v2");
    const elbClassicCollection = req.collection("elb_classic");
    
    let totalLBs = 0;
    let modernLBs = 0;
    
    // Count ELB v2 (modern)
    const elbV2Cursor = await elbV2Collection.find({
        year: year,
        month: month,
        day: day
    });
    
    for await (const doc of elbV2Cursor) {
        totalLBs++;
        modernLBs++; // All ELB v2 are considered modern
    }
    
    // Count Classic ELBs (not modern)
    const elbClassicCursor = await elbClassicCollection.find({
        year: year,
        month: month,
        day: day
    });
    
    for await (const doc of elbClassicCursor) {
        totalLBs++;
        // Don't increment modernLBs for classic ELBs
    }
    
    return totalLBs === 0 ? 0 : Math.round((modernLBs / totalLBs) * 100);
}

async function getDashboardMetrics(req) {
    const latestDate = await getLatestDate(req);
    if (!latestDate) {
        return {
            overallCompliance: 0,
            secureLoadBalancers: 0,
            currentDbVersions: 0,
            kmsKeysWithRotation: 0,
            activeAlbs: 0,
            correctlyConfiguredAlbs: 0,
            modernLbs: 0,
            date: null
        };
    }
    
    const { year, month, day } = latestDate;
    
    const [
        overallCompliance,
        secureLoadBalancers,
        currentDbVersions,
        kmsKeysWithRotation,
        activeAlbs,
        correctlyConfiguredAlbs,
        modernLbs
    ] = await Promise.all([
        getOverallCompliancePercentage(req, year, month, day),
        getSecureLoadBalancersPercentage(req, year, month, day),
        getCurrentDbVersionsPercentage(req, year, month, day),
        getKmsKeysWithRotationPercentage(req, year, month, day),
        getActiveAlbsPercentage(req, year, month, day),
        getCorrectlyConfiguredAlbsPercentage(req, year, month, day),
        getModernLbsPercentage(req, year, month, day)
    ]);
    
    return {
        overallCompliance,
        secureLoadBalancers,
        currentDbVersions,
        kmsKeysWithRotation,
        activeAlbs,
        correctlyConfiguredAlbs,
        modernLbs,
        date: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
    };
}

module.exports = {
    getDashboardMetrics
};