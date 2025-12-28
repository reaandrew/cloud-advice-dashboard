const { MongoClient } = require('mongodb');
const config = require('../config-loader');
const logger = require('../logger');
const { getDetailsByAccountId, getDetailsForAllAccounts } = require('./getDetailsByAccountId');

let db = undefined;

async function connect() {
    if (db) return db;
    try {
        const uri = config.get("database.mongodb.connection_string")
            ? config.get("database.mongodb.connection_string")
            : `mongodb://${config.get("database.mongodb.host")}:${config.get("database.mongodb.port")}`;
        const client = new MongoClient(uri);
        await client.connect();
        db = client.db(config.get("database.mongodb.database_name"));
        logger.info("✓ MongoDB Connection Initialized");
        return db;
    } catch (err) {
        logger.error(`Failed to initialize mongo: ${err}`);
        throw err;
    }
}

async function mongo(req, _, next) {
    if (!db) {
        await connect();
    }
    req.unsafeDb = db;
    req.detailsByAccountId = async (id) => await getDetailsByAccountId(id, db);
    req.getDetailsForAllAccounts = async () => await getDetailsForAllAccounts(db);
    next();
}

module.exports = { mongo, connect };
