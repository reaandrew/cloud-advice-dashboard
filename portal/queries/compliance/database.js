const { accountIdToTeam, checkDatabaseDeprecation } = require('../../utils/shared');

const dbName = 'aws_data';

async function getLatestRdsDate(client) {
    const db = client.db(dbName);
    return await db.collection("rds").findOne({}, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { year: -1, month: -1, day: -1 }
    });
}

async function getRdsForDate(client, year, month, day, projection = null) {
    const db = client.db(dbName);
    return db.collection("rds").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});
}

async function getRedshiftForDate(client, year, month, day, projection = null) {
    const db = client.db(dbName);
    return db.collection("redshift_clusters").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});
}

async function processDatabaseEngines(client, year, month, day) {
    const db = client.db(dbName);
    const teamDatabases = new Map();

    const ensureTeam = t => {
        if (!teamDatabases.has(t))
            teamDatabases.set(t, { engines: new Map() });
        return teamDatabases.get(t);
    };

    // Process RDS instances
    const rdsCursor = await getRdsForDate(client, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of rdsCursor) {
        const team = accountIdToTeam[doc.account_id] || "Unknown";
        const rec = ensureTeam(team);

        if (doc.Configuration) {
            const engine = doc.Configuration.Engine || "Unknown";
            const version = doc.Configuration.EngineVersion || "Unknown";
            const key = `${engine}-${version}`;
            rec.engines.set(key, (rec.engines.get(key) || 0) + 1);
        }
    }

    // Process Redshift clusters
    const redshiftCursor = await getRedshiftForDate(client, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of redshiftCursor) {
        const team = accountIdToTeam[doc.account_id] || "Unknown";
        const rec = ensureTeam(team);

        if (doc.Configuration) {
            const version = doc.Configuration.ClusterVersion || "Unknown";
            const key = `redshift-${version}`;
            rec.engines.set(key, (rec.engines.get(key) || 0) + 1);
        }
    }

    return teamDatabases;
}

async function getDatabaseDetails(client, year, month, day, team, engine, version) {
    const allResources = [];

    if (engine !== "redshift") {
        const rdsCursor = await getRdsForDate(client, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        for await (const doc of rdsCursor) {
            const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
            if (docTeam !== team) continue;

            if (doc.Configuration) {
                const docEngine = doc.Configuration.Engine || "Unknown";
                const docVersion = doc.Configuration.EngineVersion || "Unknown";

                const reconstructedKey = `${docEngine}-${docVersion}`;
                const expectedKey = `${engine}-${version}`;

                if (reconstructedKey === expectedKey) {
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
        const redshiftCursor = await getRedshiftForDate(client, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        for await (const doc of redshiftCursor) {
            const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
            if (docTeam !== team) continue;

            if (doc.Configuration) {
                const docVersion = doc.Configuration.ClusterVersion || "Unknown";

                if (docVersion === version) {
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