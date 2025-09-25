// Override if custom logic is preferred
const config = require('../config-loader.js');

/**
 * @param {string} id
 * @returns {{environments: Array<string>, teams: Array<string>, tenants: Array<{ id: string, name: string, description: string}}
 */
function getDetailsByAccountId(id, _) {
    const environments = new Set();
    const teams = new Set();
    const tenants = [];
    const seenTenantIds = new Set();

    const accountMappings = config.get('account_mappings', []);

    for (mapping of accountMappings) {
        if (mapping.AccountId != id) continue;
        if (!teams.has(mapping.Team)) teams.push(mapping.Team);
        if (!environments.has(mapping.Environments)) environments.push(mapping.Environments);
        if (!seenTenantIds.has(mapping.Tenant.Id)) {
            seenTenantIds.push(mapping.Tenant.Id);
            tenants.push(mapping.Tenants);
        }
    }

    return {
        environments: Array.from(environments),
        teams: teams.length == 0 ? ["Unknown"] : Array.from(teams),
        tenants
    };
}

module.exports = getDetailsByAccountId;
