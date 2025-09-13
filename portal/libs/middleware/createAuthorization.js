const { Db } = require("mongodb");

function createAccountScopedCollectionProxy(db, accountIds) {
    if (accountIds.includes('*')) {
        return (name) => db.collection(name);
    }
    return (name) => {
        const collection = db.collection(name);
        return {
            aggregate: (...args) => {
                const accountMatchStage = { $match: { account_id: { $in: accountIds } } };
                if (args[0] && Array.isArray(args[0])) {
                    args[0] = [accountMatchStage, args[0]];
                } else {
                    args[0] = [accountMatchStage];
                }
                return collection.aggregate(...args);
            },
            find: (...args) => {
                if (args[0] && typeof args[0] === 'object') {
                    args[0] = { ...args[0], account_id: { $in: accountIds } };
                } else {
                    args[0] = { account_id: { $in: accountIds } };
                }
                return collection.find(...args);
            },
            findOne: (...args) => {
                if (args[0] && typeof args[0] === 'object') {
                    args[0] = { ...args[0], account_id: { $in: accountIds } };
                } else {
                    args[0] = { account_id: { $in: accountIds } };
                }
                return collection.findOne(...args);
            },
        };
    };
}

/**
 * AccountDetails object represents information about an aws accounts.
 *
 * @typedef {Object} AccountDetails
 * @property {Array<string>} environments - The environments which the account is represented by.
 * @property {Array<string>} teams - List of teams which represent a set of people who are responsible for activity within an aws account
 * @property {Array<TenantDetails>} tenants - tenants List of tenants which represents a logical grouping of services that are independent from one another.
 */

/**
 * TenantDetails object represents information about a logical grouping of services that are independent from one another.
 *
 * @typedef {Object} TenantDetails
 * @property {string} id - A short name or identifier that uniquely identifies a tenant from one another. Should be within 8 characters.
 * @property {string} name - A longer name that describes the tenants. Should be no more than 20 characters.
 * @property {string} description - A detailed description of what the tenant does. Should be no more than 400 characters.
 */

/**
 * A higher-order function used to scope users access by AWS account ids.
 * The caller must implement the functions to get account ids that are scoped to users and to get details about the account by using the acconut id.
 *
 * @param {function(Object<string, *>, Db): Promise<Array<string>>} getAccountIds
 * @param {function(string, Db): Promise<AccountDetails>} getDetailsByAccountId
 * @returns {function(*,*,*)}
 */
function createAuthorizationMiddleware(getAccountIds, getDetailsByAccountId) {
    return async function authorizationMiddleware(req, _, next) {
        if (!req.oidc.user) {
            next();
            return;
        }
        req.collection = createAccountScopedCollectionProxy(req.unsafeDb, await getAccountIds(req.oidc.user, req.unsafeDb));
        req.detailsByAccountId = async (id) => await getDetailsByAccountId(id, req.unsafeDb);
        next();
    }
}

module.exports = createAuthorizationMiddleware;
