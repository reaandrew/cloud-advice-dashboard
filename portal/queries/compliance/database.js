const { checkDatabaseDeprecation } = require('../../utils/shared');
const logger = require('../../libs/logger');

async function getLatestRdsDate(req) {
    return await req.collection("rds").findOne({}, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { year: -1, month: -1, day: -1 }
    });
}

async function getRdsForDate(req, year, month, day, projection = null) {
    return req.collection("rds").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});
}

async function getRedshiftForDate(req, year, month, day, projection = null) {
    return req.collection("redshift_clusters").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});
}

async function processDatabaseEngines(req, year, month, day) {
    const teamDatabases = new Map();

    const ensureTeam = t => {
        if (!teamDatabases.has(t))
            teamDatabases.set(t, { engines: new Map() });
        return teamDatabases.get(t);
    };

    const results = await req.getDetailsForAllAccounts();

    if (!results || typeof results.findByAccountId !== 'function') {
        return teamDatabases;
    }

    // Process RDS instances
    const rdsCursor = await getRdsForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of rdsCursor) {
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);

        if (doc.Configuration?.configuration) {
            const engine = doc.Configuration.configuration.engine || "Unknown";
            const version = doc.Configuration.configuration.engineVersion || "Unknown";
            const key = `${engine}-${version}`;
            recs.forEach(rec => rec.engines.set(key, (rec.engines.get(key) || 0) + 1));
        }
    }

    // Process Redshift clusters
    const redshiftCursor = await getRedshiftForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of redshiftCursor) {
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);

        if (doc.Configuration?.configuration) {
            const version = doc.Configuration.configuration.clusterVersion || "Unknown";
            const key = `redshift-${version}`;
            recs.forEach(rec => rec.engines.set(key, (rec.engines.get(key) || 0) + 1));
        }
    }

    return teamDatabases;
}

async function getDatabaseDetails(req, year, month, day, team, engine, version) {
    const allResources = [];

    const results = await req.getDetailsForAllAccounts();

    if (engine !== "redshift") {
        const rdsCursor = await getRdsForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        for await (const doc of rdsCursor) {
            if (!results.findByAccountId(doc.account_id).teams.find(t => t === team)) continue;

            if (doc.Configuration?.configuration) {
                const docEngine = doc.Configuration.configuration.engine || "Unknown";
                const docVersion = doc.Configuration.configuration.engineVersion || "Unknown";

                if (`${docEngine}-${docVersion}` === `${engine}-${version}`) {
                    allResources.push({
                        resourceId: doc.resource_id,
                        shortName: doc.Configuration.configuration.dbInstanceIdentifier || doc.resource_id,
                        engine: docEngine,
                        version: docVersion,
                        accountId: doc.account_id,
                        deprecationWarnings: checkDatabaseDeprecation(docEngine, docVersion),
                        details: {
                            instanceClass: doc.Configuration.configuration.dbInstanceClass,
                            status: doc.Configuration.configuration.dbInstanceStatus,
                            allocatedStorage: doc.Configuration.configuration.allocatedStorage,
                            storageType: doc.Configuration.configuration.storageType,
                            multiAZ: doc.Configuration.configuration.multiAZ,
                            publiclyAccessible: doc.Configuration.configuration.publiclyAccessible,
                            storageEncrypted: doc.Configuration.configuration.storageEncrypted,
                            availabilityZone: doc.Configuration.configuration.availabilityZone,
                            endpoint: doc.Configuration.configuration.endpoint?.address,
                            port: doc.Configuration.configuration.endpoint?.port
                        }
                    });
                }
            }
        }
    }

    if (engine === "redshift") {
        const redshiftCursor = await getRedshiftForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        for await (const doc of redshiftCursor) {
            if (!results.findByAccountId(doc.account_id).teams.find(t => t === team)) continue;

            if (doc.Configuration?.configuration) {
                const docVersion = doc.Configuration.configuration.clusterVersion || "Unknown";

                if (docVersion === version) {
                    allResources.push({
                        resourceId: doc.resource_id,
                        shortName: doc.Configuration.configuration.clusterIdentifier || doc.resource_id,
                        engine: "redshift",
                        version: docVersion,
                        accountId: doc.account_id,
                        deprecationWarnings: checkDatabaseDeprecation("redshift", docVersion),
                        details: {
                            nodeType: doc.Configuration.configuration.nodeType,
                            status: doc.Configuration.configuration.clusterStatus,
                            numberOfNodes: doc.Configuration.configuration.numberOfNodes,
                            publiclyAccessible: doc.Configuration.configuration.publiclyAccessible,
                            encrypted: doc.Configuration.configuration.encrypted,
                            availabilityZone: doc.Configuration.configuration.availabilityZone,
                            endpoint: doc.Configuration.configuration.endpoint?.address,
                            port: doc.Configuration.configuration.endpoint?.port,
                            totalStorageGB: doc.Configuration.configuration.totalStorageCapacityInMegaBytes ? Math.round(doc.Configuration.configuration.totalStorageCapacityInMegaBytes / 1024) : null
                        }
                    });
                }
            }
        }
    }

    return allResources;
}

module.exports = {
    getLatestRdsDate,
    getRdsForDate,
    getRedshiftForDate,
    processDatabaseEngines,
    getDatabaseDetails
};
