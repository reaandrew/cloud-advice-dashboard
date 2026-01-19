const { checkDatabaseDeprecation } = require('../../utils/shared');
const { createLogger } = require('../../libs/file-logger');

// Initialize the logger
const logger = createLogger('database.log');

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

    // Process RDS instances
    const rdsCursor = await getRdsForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of rdsCursor) {
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);

        if (doc.Configuration) {
            const engine = doc.Configuration.Engine || "Unknown";
            const version = doc.Configuration.EngineVersion || "Unknown";
            const key = `${engine}-${version}`;
            recs.forEach(rec => rec.engines.set(key, (rec.engines.get(key) || 0) + 1));
        }
    }

    // Process Redshift clusters
    const redshiftCursor = await getRedshiftForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of redshiftCursor) {
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);

        if (doc.Configuration) {
            const version = doc.Configuration.ClusterVersion || "Unknown";
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
        logger.info(`Getting RDS instances for team ${team} with engine ${engine} version ${version}`);
        const rdsCursor = await getRdsForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        // Get a sample document to check field casing
        const sampleDoc = await req.collection("rds").findOne({
            year: year, month: month, day: day
        });

        if (sampleDoc && sampleDoc.Configuration) {
            logger.info('RDS sample document field check:');
            // Check if fields exist with different casing
            logger.info('Direct field access:');
            logger.info(`- DBInstanceIdentifier: ${sampleDoc.Configuration.DBInstanceIdentifier !== undefined}`);
            logger.info(`- dbInstanceIdentifier: ${sampleDoc.Configuration.dbInstanceIdentifier !== undefined}`);
            logger.info(`- DBInstanceClass: ${sampleDoc.Configuration.DBInstanceClass !== undefined}`);
            logger.info(`- dbInstanceClass: ${sampleDoc.Configuration.dbInstanceClass !== undefined}`);

            // If Configuration.configuration exists, check that too
            if (sampleDoc.Configuration.configuration) {
                logger.info('Nested field access:');
                logger.info(`- configuration.DBInstanceIdentifier: ${sampleDoc.Configuration.configuration.DBInstanceIdentifier !== undefined}`);
                logger.info(`- configuration.dbInstanceIdentifier: ${sampleDoc.Configuration.configuration.dbInstanceIdentifier !== undefined}`);
                logger.info(`- configuration.DBInstanceClass: ${sampleDoc.Configuration.configuration.DBInstanceClass !== undefined}`);
                logger.info(`- configuration.dbInstanceClass: ${sampleDoc.Configuration.configuration.dbInstanceClass !== undefined}`);
            }
        }

        let rdsCount = 0;
        for await (const doc of rdsCursor) {
            rdsCount++;
            if(!results.findByAccountId(doc.account_id).teams.find(t => t === team)) continue;

            if (doc.Configuration) {
                const docEngine = doc.Configuration.Engine || "Unknown";
                const docVersion = doc.Configuration.EngineVersion || "Unknown";

                const reconstructedKey = `${docEngine}-${docVersion}`;
                const expectedKey = `${engine}-${version}`;

                if (reconstructedKey === expectedKey) {
                    // Access fields with AWS Config casing (PascalCase)
                    allResources.push({
                        resourceId: doc.resource_id,
                        shortName: doc.Configuration.DBInstanceIdentifier || doc.resource_id,
                        engine: docEngine,
                        version: docVersion,
                        accountId: doc.account_id,
                        deprecationWarnings: checkDatabaseDeprecation(docEngine, docVersion),
                        details: {
                            instanceClass: doc.Configuration.DBInstanceClass,
                            status: doc.Configuration.DBInstanceStatus,
                            allocatedStorage: doc.Configuration.AllocatedStorage,
                            storageType: doc.Configuration.StorageType,
                            multiAZ: doc.Configuration.MultiAZ,
                            publiclyAccessible: doc.Configuration.PubliclyAccessible,
                            storageEncrypted: doc.Configuration.StorageEncrypted,
                            availabilityZone: doc.Configuration.AvailabilityZone,
                            endpoint: doc.Configuration.Endpoint?.Address,
                            port: doc.Configuration.Endpoint?.Port
                        }
                    });
                }
            }
        }
    }

    if (engine === "redshift") {
        logger.info(`Getting Redshift clusters for team ${team} with version ${version}`);
        const redshiftCursor = await getRedshiftForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        // Get a sample document to check field casing
        const sampleDoc = await req.collection("redshift_clusters").findOne({
            year: year, month: month, day: day
        });

        if (sampleDoc && sampleDoc.Configuration) {
            logger.info('Redshift sample document field check:');
            // Check if fields exist with different casing
            logger.info('Direct field access:');
            logger.info(`- ClusterIdentifier: ${sampleDoc.Configuration.ClusterIdentifier !== undefined}`);
            logger.info(`- clusterIdentifier: ${sampleDoc.Configuration.clusterIdentifier !== undefined}`);
            logger.info(`- ClusterVersion: ${sampleDoc.Configuration.ClusterVersion !== undefined}`);
            logger.info(`- clusterVersion: ${sampleDoc.Configuration.clusterVersion !== undefined}`);

            // If Configuration.configuration exists, check that too
            if (sampleDoc.Configuration.configuration) {
                logger.info('Nested field access:');
                logger.info(`- configuration.ClusterIdentifier: ${sampleDoc.Configuration.configuration.ClusterIdentifier !== undefined}`);
                logger.info(`- configuration.clusterIdentifier: ${sampleDoc.Configuration.configuration.clusterIdentifier !== undefined}`);
                logger.info(`- configuration.ClusterVersion: ${sampleDoc.Configuration.configuration.ClusterVersion !== undefined}`);
                logger.info(`- configuration.clusterVersion: ${sampleDoc.Configuration.configuration.clusterVersion !== undefined}`);
            }
        }

        let redshiftCount = 0;
        for await (const doc of redshiftCursor) {
            redshiftCount++;
            if(!results.findByAccountId(doc.account_id).teams.find(t => t === team)) continue;

            if (doc.Configuration) {
                const docVersion = doc.Configuration.ClusterVersion || "Unknown";

                if (docVersion === version) {
                    // Access fields with AWS Config casing (PascalCase)
                    allResources.push({
                        resourceId: doc.resource_id,
                        shortName: doc.Configuration.ClusterIdentifier || doc.resource_id,
                        engine: "redshift",
                        version: docVersion,
                        accountId: doc.account_id,
                        deprecationWarnings: checkDatabaseDeprecation("redshift", docVersion),
                        details: {
                            nodeType: doc.Configuration.NodeType,
                            status: doc.Configuration.ClusterStatus,
                            numberOfNodes: doc.Configuration.NumberOfNodes,
                            publiclyAccessible: doc.Configuration.PubliclyAccessible,
                            encrypted: doc.Configuration.Encrypted,
                            availabilityZone: doc.Configuration.AvailabilityZone,
                            endpoint: doc.Configuration.Endpoint?.Address,
                            port: doc.Configuration.Endpoint?.Port,
                            totalStorageGB: doc.Configuration.TotalStorageCapacityInMegaBytes ? Math.round(doc.Configuration.TotalStorageCapacityInMegaBytes / 1024) : null
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
