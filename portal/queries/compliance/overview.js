const config = require('../../libs/config-loader');
const { mandatoryTags } = require('../../utils/shared');

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
 * Get compliance overview statistics
 */
async function getComplianceOverview(req) {
    const results = await req.getDetailsForAllAccounts();
    const accountMappings = config.get('account_mappings', []);

    // Get unique counts
    const uniqueAccounts = new Set();
    const uniqueTeams = new Set();
    const uniqueTenants = new Set();

    for (const mapping of accountMappings) {
        if (mapping.AccountId) uniqueAccounts.add(mapping.AccountId);
        if (mapping.Team) uniqueTeams.add(mapping.Team);
        if (mapping.Tenant && mapping.Tenant.Id) uniqueTenants.add(mapping.Tenant.Id);
    }

    const counts = {
        accounts: uniqueAccounts.size,
        teams: uniqueTeams.size,
        tenants: uniqueTenants.size
    };

    // Get latest dates for each collection
    const tagsDate = await getLatestDate(req, "tags");
    const rdsDate = await getLatestDate(req, "rds");
    const elbDate = await getLatestDate(req, "elb_v2");
    const kmsDate = await getLatestDate(req, "kms_key_metadata");
    const asgDate = await getLatestDate(req, "autoscaling_groups");

    // Get non-compliant counts by resource type
    const resourceTypes = [
        {
            name: 'Tagging',
            teamsNonCompliant: 0,
            tenantsNonCompliant: 0
        },
        {
            name: 'Database',
            teamsNonCompliant: 0,
            tenantsNonCompliant: 0
        },
        {
            name: 'Load Balancers',
            teamsNonCompliant: 0,
            tenantsNonCompliant: 0
        },
        {
            name: 'KMS Keys',
            teamsNonCompliant: 0,
            tenantsNonCompliant: 0
        },
        {
            name: 'Auto Scaling',
            teamsNonCompliant: 0,
            tenantsNonCompliant: 0
        }
    ];

    // Process tagging compliance
    if (tagsDate) {
        const { teamsNonCompliant, tenantsNonCompliant } = await getTaggingNonCompliant(req, tagsDate.year, tagsDate.month, tagsDate.day);
        resourceTypes[0].teamsNonCompliant = teamsNonCompliant;
        resourceTypes[0].tenantsNonCompliant = tenantsNonCompliant;
    }

    // Process database compliance
    if (rdsDate) {
        const { teamsNonCompliant, tenantsNonCompliant } = await getDatabaseNonCompliant(req, rdsDate.year, rdsDate.month, rdsDate.day);
        resourceTypes[1].teamsNonCompliant = teamsNonCompliant;
        resourceTypes[1].tenantsNonCompliant = tenantsNonCompliant;
    }

    // Process load balancer compliance
    if (elbDate) {
        const { teamsNonCompliant, tenantsNonCompliant } = await getLoadBalancerNonCompliant(req, elbDate.year, elbDate.month, elbDate.day);
        resourceTypes[2].teamsNonCompliant = teamsNonCompliant;
        resourceTypes[2].tenantsNonCompliant = tenantsNonCompliant;
    }

    // Process KMS compliance
    if (kmsDate) {
        const { teamsNonCompliant, tenantsNonCompliant } = await getKmsNonCompliant(req, kmsDate.year, kmsDate.month, kmsDate.day);
        resourceTypes[3].teamsNonCompliant = teamsNonCompliant;
        resourceTypes[3].tenantsNonCompliant = tenantsNonCompliant;
    }

    // Process auto scaling compliance
    if (asgDate) {
        const { teamsNonCompliant, tenantsNonCompliant } = await getAutoScalingNonCompliant(req, asgDate.year, asgDate.month, asgDate.day);
        resourceTypes[4].teamsNonCompliant = teamsNonCompliant;
        resourceTypes[4].tenantsNonCompliant = tenantsNonCompliant;
    }

    return {
        counts,
        resourceTypes
    };
}

/**
 * Get non-compliant counts for tagging
 */
async function getTaggingNonCompliant(req, year, month, day) {
    const teamsWithIssues = new Set();
    const tenantsWithIssues = new Set();

    const collection = await req.collection("tags");
    const cursor = collection.find({ year, month, day });

    const isMissing = v => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
    const bucketStartsWithAccountId = arn => /^\d{12}/.test((arn.split(":::")[1] || ""));
    const results = await req.getDetailsForAllAccounts();

    for await (const doc of cursor) {
        if (doc.resource_type === "bucket" && bucketStartsWithAccountId(doc.resource_id)) continue;

        const accountDetails = results.findByAccountId(doc.account_id);
        const teams = accountDetails.teams || [];
        const tenants = accountDetails.tenants || [];

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
                break;
            }
        }

        if (hasAnyMissingTag) {
            teams.forEach(team => { if (team) teamsWithIssues.add(team); });
            tenants.forEach(tenant => {
                const tenantId = tenant.Id || tenant.id;
                if (tenantId) tenantsWithIssues.add(tenantId);
            });
        }
    }

    return {
        teamsNonCompliant: teamsWithIssues.size,
        tenantsNonCompliant: tenantsWithIssues.size
    };
}

/**
 * Get non-compliant counts for database
 */
async function getDatabaseNonCompliant(req, year, month, day) {
    const teamsWithIssues = new Set();
    const tenantsWithIssues = new Set();
    const results = await req.getDetailsForAllAccounts();
    const deprecatedVersions = config.get('compliance.database.deprecated_versions', {});

    // Process RDS instances
    const rdsCollection = await req.collection("rds");
    const rdsCursor = rdsCollection.find({ year, month, day });

    for await (const doc of rdsCursor) {
        const engine = doc.Engine || 'unknown';
        const version = doc.EngineVersion || '';
        let isDeprecated = false;

        if (deprecatedVersions[engine]) {
            for (const deprecated of deprecatedVersions[engine]) {
                if (version.startsWith(deprecated.version) || version.includes(deprecated.version)) {
                    isDeprecated = true;
                    break;
                }
            }
        }

        if (isDeprecated) {
            const accountDetails = results.findByAccountId(doc.account_id);
            accountDetails.teams.forEach(team => { if (team) teamsWithIssues.add(team); });
            accountDetails.tenants.forEach(tenant => {
                const tenantId = tenant.Id || tenant.id;
                if (tenantId) tenantsWithIssues.add(tenantId);
            });
        }
    }

    return {
        teamsNonCompliant: teamsWithIssues.size,
        tenantsNonCompliant: tenantsWithIssues.size
    };
}

/**
 * Get non-compliant counts for load balancers
 */
async function getLoadBalancerNonCompliant(req, year, month, day) {
    const teamsWithIssues = new Set();
    const tenantsWithIssues = new Set();
    const results = await req.getDetailsForAllAccounts();

    // Get secure load balancers
    const listenersCollection = await req.collection("elb_v2_listeners");
    const listenersCursor = listenersCollection.find({ year, month, day });
    const secureLoadBalancers = new Set();

    for await (const doc of listenersCursor) {
        if (doc.Protocol === 'HTTPS' || doc.Protocol === 'TLS') {
            secureLoadBalancers.add(doc.LoadBalancerArn);
        }
    }

    // Check ELB v2 for insecure LBs
    const elbV2Collection = await req.collection("elb_v2");
    const elbV2Cursor = elbV2Collection.find({ year, month, day });

    for await (const doc of elbV2Cursor) {
        if (!secureLoadBalancers.has(doc.LoadBalancerArn)) {
            const accountDetails = results.findByAccountId(doc.account_id);
            accountDetails.teams.forEach(team => { if (team) teamsWithIssues.add(team); });
            accountDetails.tenants.forEach(tenant => {
                const tenantId = tenant.Id || tenant.id;
                if (tenantId) tenantsWithIssues.add(tenantId);
            });
        }
    }

    // Check Classic ELBs for insecure
    const classicCollection = await req.collection("elb_classic");
    const classicCursor = classicCollection.find({ year, month, day });

    for await (const doc of classicCursor) {
        let hasHttps = false;
        if (doc.ListenerDescriptions && Array.isArray(doc.ListenerDescriptions)) {
            hasHttps = doc.ListenerDescriptions.some(ld =>
                ld.Listener && (ld.Listener.Protocol === 'HTTPS' || ld.Listener.Protocol === 'SSL')
            );
        }

        if (!hasHttps) {
            const accountDetails = results.findByAccountId(doc.account_id);
            accountDetails.teams.forEach(team => { if (team) teamsWithIssues.add(team); });
            accountDetails.tenants.forEach(tenant => {
                const tenantId = tenant.Id || tenant.id;
                if (tenantId) tenantsWithIssues.add(tenantId);
            });
        }
    }

    return {
        teamsNonCompliant: teamsWithIssues.size,
        tenantsNonCompliant: tenantsWithIssues.size
    };
}

/**
 * Get non-compliant counts for KMS
 */
async function getKmsNonCompliant(req, year, month, day) {
    const teamsWithIssues = new Set();
    const tenantsWithIssues = new Set();
    const results = await req.getDetailsForAllAccounts();
    const collection = await req.collection("kms_key_metadata");
    const cursor = collection.find({ year, month, day });

    for await (const doc of cursor) {
        if (doc.KeyRotationEnabled !== true) {
            const accountDetails = results.findByAccountId(doc.account_id);
            accountDetails.teams.forEach(team => { if (team) teamsWithIssues.add(team); });
            accountDetails.tenants.forEach(tenant => {
                const tenantId = tenant.Id || tenant.id;
                if (tenantId) tenantsWithIssues.add(tenantId);
            });
        }
    }

    return {
        teamsNonCompliant: teamsWithIssues.size,
        tenantsNonCompliant: tenantsWithIssues.size
    };
}

/**
 * Get non-compliant counts for auto scaling
 */
async function getAutoScalingNonCompliant(req, year, month, day) {
    const teamsWithIssues = new Set();
    const tenantsWithIssues = new Set();
    const results = await req.getDetailsForAllAccounts();
    const collection = await req.collection("autoscaling_groups");
    const cursor = collection.find({ year, month, day });

    for await (const doc of cursor) {
        const instances = doc.Configuration?.Instances || [];
        if (instances.length === 0) {
            const accountDetails = results.findByAccountId(doc.account_id);
            accountDetails.teams.forEach(team => { if (team) teamsWithIssues.add(team); });
            accountDetails.tenants.forEach(tenant => {
                const tenantId = tenant.Id || tenant.id;
                if (tenantId) tenantsWithIssues.add(tenantId);
            });
        }
    }

    return {
        teamsNonCompliant: teamsWithIssues.size,
        tenantsNonCompliant: tenantsWithIssues.size
    };
}

module.exports = {
    getComplianceOverview
};
