const { MongoClient } = require('mongodb');
const config = require('../config-loader');
const logger = require('../logger');
const { getDetailsByAccountId, getDetailsForAllAccounts } = require('./getDetailsByAccountId');

let db = undefined;

async function mongo(req, _, next) {
    if (db === undefined) {
        try {
            const uri = `mongodb://${config.get("database.mongodb.host")}:${config.get("database.mongodb.port")}`;
            const client = new MongoClient(uri);
            await client.connect();
            db = client.db(config.get("database.mongodb.database_name"))
        } catch (err) {
            logger.error(`Failed to initialize mongo: ${err}`);
            throw err;
        }
    }
    req.unsafeDb = db;
    req.collection = (name) => db.collection(name);
    req.detailsByAccountId = async (id) => await getDetailsByAccountId(id, db);
    req.getDetailsForAllAccounts = async () => await getDetailsForAllAccounts(db);
    
    next();
}

module.exports = mongo;
