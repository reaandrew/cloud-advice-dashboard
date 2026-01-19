// Override if custom logic is preferred
const config = require('../config-loader.js');

/**
 * @param {string} id
 * @returns {Promise<{environments: Array<string>, teams: Array<string>, tenants: Array<{ id: string, name: string, description: string}>}
 */
function getDetailsByAccountId(id, _) {
  const logger = require('../logger');
  const environments = new Set();
  const teams = new Set();
  const tenants = [];
  const seenTenantIds = new Set();

  const accountMappings = config.get('account_mappings', []);

  // Just log the length, not the full mappings
  logger.debug(`getDetailsByAccountId: Processing ${accountMappings.length} mappings for account ID: ${id}`);

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
  // Add debug logging
  const logger = require('../logger');

  // Load account mappings and debug info
  const accountMappings = config.get('account_mappings', []);
  logger.debug(`getDetailsForAllAccounts: Loading account mappings, found ${accountMappings.length} mappings`);

  // Don't log the full mappings, just basic info to avoid cluttering logs
  if (accountMappings.length > 0) {
    logger.debug('First mapping AccountId:', accountMappings[0].AccountId);
    logger.debug('First mapping Team:', accountMappings[0].Team);
  }

  return (function () {
    return {
      findByAccountId: (account_id) => {
        // Debug individual lookups if needed
        logger.debug(`Looking up account details for: ${account_id}`);
        const result = getDetailsByAccountId(account_id, db);

        // Log the team count but not the full teams list
        if (result && Array.isArray(result.teams)) {
          logger.debug(`Found ${result.teams.length} teams for account ${account_id}`);
        }

        return result;
      }
    }
  })();
}


module.exports = {
  getDetailsByAccountId: getDetailsByAccountId,
  getDetailsForAllAccounts: getDetailsForAllAccounts
};

