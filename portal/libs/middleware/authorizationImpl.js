const { Db } = require('mongodb')
const config = require('../config-loader.js')
const createAuthorizationMiddleware = require('./createAuthorization.js');

/**
 * @param {Object<string, *>} claims
 * @param {Db} db
 * @returns {Promise<Array<string>>}
 */
async function getAccountIds(claims, db) {
    if (config.get('auth.admin_emails') === claims.email) {
        return ["*"];
    }
    const removeNamespaces = g => g.split("/").slice(-1)[0]; // Claims may have namespaces on them.
    return (await db.collection("account_details").aggregate([
        {$match: { "accountDetails.groups": { $in: claims.groups.map(removeNamespaces) }}}
    ]).toArray()).map(doc => doc.account_id)
}

module.exports = createAuthorizationMiddleware(getAccountIds)
