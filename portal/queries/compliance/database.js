const { checkDatabaseDeprecation } = require('../../utils/shared');
const { createLogger } = require('../../libs/file-logger');

// Initialize the logger
const logger = createLogger('database.log');

// Add direct console logs to ensure we see output no matter what
console.log('=== DATABASE QUERY MODULE LOADED ===');
console.log('This message should appear in the standard output');

// Force log to standard out for debugging
process.stdout.write('DIRECT OUTPUT: Database query module initialized\n');

async function getLatestRdsDate(req) {
    return await req.collection("rds").findOne({}, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { year: -1, month: -1, day: -1 }
    });
}

async function getRdsForDate(req, year, month, day, projection = null) {
    // Direct standard out logging to ensure we see data regardless of logger config
    console.log(`DIRECT: Getting RDS data for ${year}-${month}-${day}`);

    // Query for RDS data
    const cursor = req.collection("rds").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});

    // Check if cursor is valid and has data
    const sampleBatch = await cursor.toArray();
    if (sampleBatch && sampleBatch.length > 0) {
        console.log(`DIRECT: Found ${sampleBatch.length} RDS documents`);

        // Debug log the structure of the first document to see field names and casing
        if (sampleBatch[0] && sampleBatch[0].Configuration) {
            console.log('DIRECT: First RDS doc Configuration keys:');
            console.log(Object.keys(sampleBatch[0].Configuration));

            // Check for engine and version fields
            if (sampleBatch[0].Configuration.Engine) {
                console.log(`DIRECT: Example RDS engine: ${sampleBatch[0].Configuration.Engine}`);
            } else if (sampleBatch[0].Configuration.engine) {
                console.log(`DIRECT: Example RDS engine (camelCase): ${sampleBatch[0].Configuration.engine}`);
            }

            if (sampleBatch[0].Configuration.EngineVersion) {
                console.log(`DIRECT: Example RDS version: ${sampleBatch[0].Configuration.EngineVersion}`);
            } else if (sampleBatch[0].Configuration.engineVersion) {
                console.log(`DIRECT: Example RDS version (camelCase): ${sampleBatch[0].Configuration.engineVersion}`);
            }

            // Check nested configuration if present
            if (sampleBatch[0].Configuration.configuration) {
                console.log('DIRECT: Nested configuration found with keys:');
                console.log(Object.keys(sampleBatch[0].Configuration.configuration));
            }
        }
    } else {
        console.log('DIRECT: No RDS documents found for this date!');
    }

    // Re-create the cursor for actual use (since we consumed the previous one)
    return req.collection("rds").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});
}

async function getRedshiftForDate(req, year, month, day, projection = null) {
    // Direct standard out logging for Redshift
    console.log(`DIRECT: Getting Redshift data for ${year}-${month}-${day}`);

    // Query for Redshift data
    const cursor = req.collection("redshift_clusters").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});

    // Check if cursor is valid and has data
    const sampleBatch = await cursor.toArray();
    if (sampleBatch && sampleBatch.length > 0) {
        console.log(`DIRECT: Found ${sampleBatch.length} Redshift documents`);

        // Debug log the structure of the first document to see field names and casing
        if (sampleBatch[0] && sampleBatch[0].Configuration) {
            console.log('DIRECT: First Redshift doc Configuration keys:');
            console.log(Object.keys(sampleBatch[0].Configuration));

            // Check for version fields
            if (sampleBatch[0].Configuration.ClusterVersion) {
                console.log(`DIRECT: Example Redshift version: ${sampleBatch[0].Configuration.ClusterVersion}`);
            } else if (sampleBatch[0].Configuration.clusterVersion) {
                console.log(`DIRECT: Example Redshift version (camelCase): ${sampleBatch[0].Configuration.clusterVersion}`);
            }

            // Check nested configuration if present
            if (sampleBatch[0].Configuration.configuration) {
                console.log('DIRECT: Nested configuration found with keys:');
                console.log(Object.keys(sampleBatch[0].Configuration.configuration));
            }
        }
    } else {
        console.log('DIRECT: No Redshift documents found for this date!');
    }

    // Re-create the cursor for actual use (since we consumed the previous one)
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

    logger.info('Calling req.getDetailsForAllAccounts() in processDatabaseEngines...');

    try {
        // Check if the function exists
        if (typeof req.getDetailsForAllAccounts !== 'function') {
            logger.error('getDetailsForAllAccounts is not a function!', typeof req.getDetailsForAllAccounts);
            logger.info('DATA', false);
            throw new Error('getDetailsForAllAccounts is not a function');
        }

        const results = await req.getDetailsForAllAccounts();
        logger.info('Account results type:', Object.prototype.toString.call(results));
        logger.info('DATA', !!results);

        // Add guard against direct logging of the object
        // Replace console.log with logger.debug to ensure proper formatting
        const originalConsoleLog = console.log;
        console.log = function(...args) {
            // Check if the first argument is a Map with many entries
            if (args[0] instanceof Map && args[0].size > 25) {
                logger.error(`Large Map detected in console.log - ${args[0].size} entries`);
                // Don't log the full Map
                return;
            }
            originalConsoleLog.apply(console, args);
        };

        // Debug the first few accounts (limit to avoid large logs)
        logger.info('Account results structure check:');
        if (results && typeof results.findByAccountId === 'function') {
            // Just log the structure, not the full contents
            logger.info('Results object has expected findByAccountId method');

            // Test with a sample account ID
            try {
                const sample = results.findByAccountId('123456789012');
                logger.info('Sample account lookup succeeded:', !!sample);
                if (sample && Array.isArray(sample.teams)) {
                    logger.info('Sample teams array length:', sample.teams.length);
                }
            } catch (sampleErr) {
                logger.error('Error testing sample account lookup:', sampleErr);
            }
        } else {
            logger.error('Unexpected structure for results:', typeof results);
            if (results === null || results === undefined) {
                logger.error('Results is null or undefined');
            }
        }

        // Restore the original console.log
        console.log = originalConsoleLog;
    } catch (err) {
        logger.error('Error calling getDetailsForAllAccounts:', err);
    }

    // Process RDS instances
    const rdsCursor = await getRdsForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of rdsCursor) {
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);

        if (doc.Configuration) {
            // Add detailed logging for database engine field access
            logger.debug('RDS doc Configuration keys:', Object.keys(doc.Configuration));

            // Debug the exact field names and values
            logger.debug(`RDS doc direct field access:
- Configuration.Engine: ${doc.Configuration.Engine !== undefined ? 'exists' : 'undefined'}
- Configuration.engine: ${doc.Configuration.engine !== undefined ? 'exists' : 'undefined'}
- Configuration.EngineVersion: ${doc.Configuration.EngineVersion !== undefined ? 'exists' : 'undefined'}
- Configuration.engineVersion: ${doc.Configuration.engineVersion !== undefined ? 'exists' : 'undefined'}`);

            // Check if nested configuration exists
            if (doc.Configuration.configuration) {
                logger.debug('RDS nested configuration found, keys:', Object.keys(doc.Configuration.configuration));
                logger.debug(`RDS doc nested field access:
- Configuration.configuration.Engine: ${doc.Configuration.configuration.Engine !== undefined ? 'exists' : 'undefined'}
- Configuration.configuration.engine: ${doc.Configuration.configuration.engine !== undefined ? 'exists' : 'undefined'}
- Configuration.configuration.EngineVersion: ${doc.Configuration.configuration.EngineVersion !== undefined ? 'exists' : 'undefined'}
- Configuration.configuration.engineVersion: ${doc.Configuration.configuration.engineVersion !== undefined ? 'exists' : 'undefined'}`);
            }

            // Use PascalCase field names (AWS Config format) with fallback to "Unknown"
            const engine = doc.Configuration.Engine || (doc.Configuration.configuration && doc.Configuration.configuration.Engine) || "Unknown";
            const version = doc.Configuration.EngineVersion || (doc.Configuration.configuration && doc.Configuration.configuration.EngineVersion) || "Unknown";

            // Log the resolved values
            logger.debug(`Resolved engine: ${engine}, version: ${version}`);

            const key = `${engine}-${version}`;
            recs.forEach(rec => rec.engines.set(key, (rec.engines.get(key) || 0) + 1));
        } else {
            logger.debug('RDS doc missing Configuration section:', doc.resource_id);
        }
    }

    // Process Redshift clusters
    const redshiftCursor = await getRedshiftForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of redshiftCursor) {
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);

        if (doc.Configuration) {
            // Add detailed logging for Redshift cluster version field access
            logger.debug('Redshift doc Configuration keys:', Object.keys(doc.Configuration));

            // Debug the exact field names and values
            logger.debug(`Redshift doc direct field access:
- Configuration.ClusterVersion: ${doc.Configuration.ClusterVersion !== undefined ? 'exists' : 'undefined'}
- Configuration.clusterVersion: ${doc.Configuration.clusterVersion !== undefined ? 'exists' : 'undefined'}`);

            // Check if nested configuration exists
            if (doc.Configuration.configuration) {
                logger.debug('Redshift nested configuration found, keys:', Object.keys(doc.Configuration.configuration));
                logger.debug(`Redshift doc nested field access:
- Configuration.configuration.ClusterVersion: ${doc.Configuration.configuration.ClusterVersion !== undefined ? 'exists' : 'undefined'}
- Configuration.configuration.clusterVersion: ${doc.Configuration.configuration.clusterVersion !== undefined ? 'exists' : 'undefined'}`);
            }

            // Use PascalCase field names (AWS Config format) with fallback to "Unknown"
            const version = doc.Configuration.ClusterVersion ||
                           (doc.Configuration.configuration && doc.Configuration.configuration.ClusterVersion) ||
                           "Unknown";

            // Log the resolved version
            logger.debug(`Resolved Redshift version: ${version}`);

            const key = `redshift-${version}`;
            recs.forEach(rec => rec.engines.set(key, (rec.engines.get(key) || 0) + 1));
        } else {
            logger.debug('Redshift doc missing Configuration section:', doc.resource_id);
        }
    }

    return teamDatabases;
}

async function getDatabaseDetails(req, year, month, day, team, engine, version) {
    const allResources = [];

    logger.info('Calling req.getDetailsForAllAccounts() in getDatabaseDetails...');
    const results = await req.getDetailsForAllAccounts();

    // Additional debug for the specific team we're looking for
    logger.info(`Checking if team "${team}" exists in account data`);

    // Check if findByAccountId method exists and log some sample data
    if (results && typeof results.findByAccountId === 'function') {
        logger.info('Looking up sample accounts to check team structure');
        try {
            // Try with a sample account ID
            const sampleAccounts = ['123456789012', '987654321098'];

            for (const accountId of sampleAccounts) {
                try {
                    const accountDetails = results.findByAccountId(accountId);
                    if (accountDetails) {
                        logger.info(`Account ${accountId} teams data type:`, Object.prototype.toString.call(accountDetails.teams));
                        if (Array.isArray(accountDetails.teams)) {
                            logger.info(`Account ${accountId} has ${accountDetails.teams.length} teams`);
                            // Check if our team is in this account
                            const hasTeam = accountDetails.teams.includes(team);
                            logger.info(`Account ${accountId} has team "${team}": ${hasTeam}`);
                        }
                    }
                } catch (err) {
                    logger.error(`Error checking sample account ${accountId}:`, err);
                }
            }
        } catch (err) {
            logger.error('Error in account details debug:', err);
        }
    }

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
