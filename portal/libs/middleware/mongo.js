const { MongoClient } = require('mongodb');
const config = require('../config-loader');
const logger = require('../logger');

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
    req.detailsByAccountId = (accountId) => {
        const mappings = config.get('account_mappings', []);
        const mapping = mappings.find(m => m.OwnerId === accountId);
        if (mapping) {
            return {
                environments: [mapping["Application Env"] || "unknown"],
                teams: [mapping.Team || "Unknown"],
                tenants: [mapping.Service || "unknown"]
            };
        }
        return { environments: [], teams: ["Unknown"], tenants: [] };
    };
    next();
}

module.exports = mongo;
