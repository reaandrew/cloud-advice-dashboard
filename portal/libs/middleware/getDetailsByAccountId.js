// Override if custom logic is preferred
const config = require('../config-loader.js');
const logger = require('../logger.js');

// Cache for the account lookup index (built once from tenants + platform_contacts)
let accountLookupIndex = null;

/**
 * Build an index mapping account_id -> { teams, tenants, environments }
 * from the new tenants.json and platform_contacts.json schema
 */
function buildAccountLookupIndex() {
  const tenants = config.get('tenants', null);
  const platformContacts = config.get('platform_contacts', null);

  // If new schema files aren't configured, return null to fall back to old format
  if (!tenants || !platformContacts) {
    logger.warn('getDetailsByAccountId: tenants/platform_contacts not configured, using legacy account_mappings');
    return null;
  }

  // Build reverse lookup: platform_contact_id -> contact name (team name)
  const contactIdToName = new Map();
  for (const [contactId, contact] of Object.entries(platformContacts)) {
    contactIdToName.set(contactId, contact.name || contact.description || contactId);
  }

  // Build account_id -> details index
  const index = new Map();

  for (const [tenantId, tenant] of Object.entries(tenants)) {
    const platformContactId = tenant.platform_contact?.id;
    const teamName = platformContactId ? contactIdToName.get(platformContactId) : null;

    if (!tenant.environments || !Array.isArray(tenant.environments)) {
      continue;
    }

    for (const env of tenant.environments) {
      const accountId = env.account_id;
      if (!accountId) continue;

      if (!index.has(accountId)) {
        index.set(accountId, {
          teams: new Set(),
          tenants: [],
          environments: new Set(),
          seenTenantIds: new Set()
        });
      }

      const entry = index.get(accountId);

      // Add team name
      if (teamName) {
        entry.teams.add(teamName);
      }

      // Add environment
      if (env.name) {
        entry.environments.add(env.name);
      }

      // Add tenant (avoid duplicates)
      if (!entry.seenTenantIds.has(tenantId)) {
        entry.seenTenantIds.add(tenantId);
        entry.tenants.push({
          Id: tenantId,
          id: tenantId,
          Name: tenant.display_name || tenant.name || tenantId,
          name: tenant.display_name || tenant.name || tenantId,
          Description: tenant.description || ''
        });
      }
    }
  }

  logger.info('getDetailsByAccountId: Built account lookup index', { accountCount: index.size });

  return index;
}

/**
 * Get the account lookup index, building it if necessary
 */
function getAccountLookupIndex() {
  if (accountLookupIndex === null) {
    accountLookupIndex = buildAccountLookupIndex();
  }
  return accountLookupIndex;
}

/**
 * @param {string} id - AWS account ID
 * @returns {{environments: Array<string>, teams: Array<string>, tenants: Array<{ id: string, name: string, description: string}>}}
 */
function getDetailsByAccountId(id, _) {
  // Try new schema first
  const index = getAccountLookupIndex();

  if (index) {
    const entry = index.get(id);
    if (entry) {
      return {
        environments: Array.from(entry.environments),
        teams: entry.teams.size === 0 ? ['Unknown'] : Array.from(entry.teams),
        tenants: entry.tenants
      };
    } else {
      return {
        environments: [],
        teams: ['Unknown'],
        tenants: []
      };
    }
  }

  // Fall back to legacy account_mappings format
  const environments = new Set();
  const teams = new Set();
  const tenants = [];
  const seenTenantIds = new Set();

  const accountMappings = config.get('account_mappings', []);

  for (const mapping of accountMappings) {
    if (mapping.AccountId != id) continue;
    if (mapping.Team && !teams.has(mapping.Team)) teams.add(mapping.Team);
    if (mapping.Environment && !environments.has(mapping.Environment)) environments.add(mapping.Environment);
    if (mapping.Tenant?.Id && !seenTenantIds.has(mapping.Tenant.Id)) {
      seenTenantIds.add(mapping.Tenant.Id);
      tenants.push(mapping.Tenant);
    }
  }

  return {
    environments: Array.from(environments),
    teams: teams.size == 0 ? ['Unknown'] : Array.from(teams),
    tenants
  };
}


function getDetailsForAllAccounts(db) {
  return {
    findByAccountId: (account_id) => {
      return getDetailsByAccountId(account_id, db);
    }
  };
}

/**
 * Clear the cached index (useful for testing or config reload)
 */
function clearCache() {
  accountLookupIndex = null;
}

module.exports = {
  getDetailsByAccountId,
  getDetailsForAllAccounts,
  clearCache
};
