const { MongoClient } = require('mongodb');
const config = require('../config-loader');
const logger = require('../logger');
const getDetailsByAccountId = require('./getDetailsByAccountId');

let db = undefined;
let client = undefined;

async function mongo(req, _, next) {
    if (db === undefined) {
        try {
            const uri = `mongodb://${config.get("database.mongodb.host")}:${config.get("database.mongodb.port")}`;

            // CRITICAL: Add connection pool and performance options
            client = new MongoClient(uri, {
                // Connection Pool Settings
                minPoolSize: 10,      // Minimum connections to maintain
                maxPoolSize: 100,     // Maximum connections allowed
                maxIdleTimeMS: 30000, // Close idle connections after 30 seconds

                // Connection Settings
                serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds if can't connect
                socketTimeoutMS: 45000,         // Socket timeout

                // Performance Settings
                maxConnecting: 10,     // Maximum connections being established
                directConnection: false,

                // Write Concern (for write operations)
                w: 1,
                wtimeoutMS: 5000,

                // Monitoring
                monitorCommands: true  // Enable command monitoring for debugging
            });

            await client.connect();
            db = client.db(config.get("database.mongodb.database_name"));

            // Create indexes if they don't exist (one-time operation)
            await ensureIndexes(db);

            logger.info('✓ MongoDB connected with connection pool');
        } catch (err) {
            logger.error(`Failed to initialize mongo: ${err}`);
            throw err;
        }
    }
    req.unsafeDb = db;
    req.collection = (name) => db.collection(name);
    req.detailsByAccountId = async (id) => await getDetailsByAccountId(id, db);
    next();
}

// Ensure indexes exist (run once on startup)
async function ensureIndexes(db) {
    const collections = ['tags', 'elb_v2', 'elb_v2_listeners', 'rds', 'kms_keys'];

    for (const collName of collections) {
        const coll = db.collection(collName);

        // Check if index exists before creating
        const indexes = await coll.indexes();
        const indexNames = indexes.map(idx => idx.name);

        if (!indexNames.includes('year_1_month_1_day_1')) {
            await coll.createIndex({ year: 1, month: 1, day: 1 });
            logger.info(`Created date index for ${collName}`);
        }
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    if (client) {
        await client.close();
        logger.info('MongoDB connection closed');
    }
    process.exit(0);
});

module.exports = mongo;