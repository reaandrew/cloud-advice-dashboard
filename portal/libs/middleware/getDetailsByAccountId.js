// Override if custom logic is preferred
const config = require('../config-loader.js');

/**
 * @param {string} id
 * @returns {Promise<{environments: Array<string>, teams: Array<string>, tenants: Array<{ id: string, name: string, description: string}>}
 */
function getDetailsByAccountId(id, _) {
  const environments = new Set();
  const teams = new Set();
  const tenants = [];
  const seenTenantIds = new Set();

  const accountMappings = config.get('account_mappings', []);

  for (mapping of accountMappings) {
    if (mapping.AccountId != id) continue;
    if (!teams.has(mapping.Team)) teams.add(mapping.Team);
    if (!environments.has(mapping.Environments)) environments.add(mapping.Environments);
    if (!seenTenantIds.has(mapping.Tenant.Id)) {
      seenTenantIds.add(mapping.Tenant.Id);
      tenants.push(mapping.Tenant);
    }
  }

  return {
    environments: Array.from(environments),
    teams: teams.size == 0 ? ["Unknown"] : Array.from(teams),
    tenants
  };
}


function getDetailsForAllAccounts(db) {
  // Load account mappings
  const accountMappings = config.get('account_mappings', []);

  return (function () {
    return {
      findByAccountId: (account_id) => {
        const result = getDetailsByAccountId(account_id, db);
        return result;
      }
    }
  })();
}


module.exports = {
  getDetailsByAccountId: getDetailsByAccountId,
  getDetailsForAllAccounts: getDetailsForAllAccounts
};
