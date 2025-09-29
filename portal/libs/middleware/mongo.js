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

            // Create client with connection pool and performance options
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
                monitorCommands: false  // Disable command monitoring for now
            });

            await client.connect();
            db = client.db(config.get("database.mongodb.database_name"));

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

// Graceful shutdown
process.on('SIGINT', async () => {
    if (client) {
        await client.close();
        logger.info('MongoDB connection closed');
    }
    process.exit(0);
});

module.exports = mongo;
