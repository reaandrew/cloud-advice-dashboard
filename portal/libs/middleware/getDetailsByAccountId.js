// Override if custom logic is preferred
const config = require('../config-loader.js');
const logger = require('../logger.js');

// Cache for the account lookup index (built once from tenants + platform_contacts)
let accountLookupIndex = null;

/**
 * Redact account ID for logging - shows first 4 digits only
 */
function redactAccountId(accountId) {
  if (!accountId) return 'unknown';
  const str = String(accountId);
  if (str.length <= 4) return str;
  return str.substring(0, 4) + '*'.repeat(str.length - 4);
}

/**
 * Build an index mapping account_id -> { teams, tenants, environments }
 * from the new tenants.json and platform_contacts.json schema
 */
function buildAccountLookupIndex() {
  const tenants = config.get('tenants', null);
  const platformContacts = config.get('platform_contacts', null);

  // If new schema files aren't configured, return null to fall back to old format
  if (!tenants || !platformContacts) {
    logger.warn('getDetailsByAccountId: New schema (tenants/platform_contacts) not configured, falling back to legacy account_mappings', {
      hasTenants: !!tenants,
      tenantsType: tenants === null ? 'null' : (tenants === undefined ? 'undefined' : typeof tenants),
      hasPlatformContacts: !!platformContacts,
      platformContactsType: platformContacts === null ? 'null' : (platformContacts === undefined ? 'undefined' : typeof platformContacts)
    });
    return null;
  }

  logger.info('getDetailsByAccountId: Building account lookup index from tenants and platform_contacts');

  // Build reverse lookup: platform_contact_id -> contact name (team name)
  const contactIdToName = new Map();
  for (const [contactId, contact] of Object.entries(platformContacts)) {
    contactIdToName.set(contactId, contact.name || contact.description || contactId);
  }
  logger.debug('getDetailsByAccountId: Loaded platform contacts', { count: contactIdToName.size });

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

  // Log sample entry to verify structure
  const sampleAccountIds = Array.from(index.keys()).slice(0, 3);
  const sampleEntries = sampleAccountIds.map(id => {
    const entry = index.get(id);
    return {
      accountId: redactAccountId(id),
      teamsCount: entry.teams.size,
      teamsArray: Array.from(entry.teams),
      tenantCount: entry.tenants.length
    };
  });

  logger.info('getDetailsByAccountId: Built account lookup index', {
    accountCount: index.size,
    sampleAccountIds: sampleAccountIds.map(redactAccountId),
    sampleEntries: sampleEntries
  });

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
      const result = {
        environments: Array.from(entry.environments),
        teams: entry.teams.size === 0 ? ['Unknown'] : Array.from(entry.teams),
        tenants: entry.tenants
      };
      logger.debug('getDetailsByAccountId: Found account in new schema index', {
        accountId: id,
        teams: result.teams,
        tenantCount: result.tenants.length
      });
      return result;
    } else {
      logger.debug('getDetailsByAccountId: Account not found in new schema index', { accountId: id });
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
  logger.debug('getDetailsByAccountId: Using legacy account_mappings', {
    accountId: id,
    mappingsCount: accountMappings.length
  });

  for (const mapping of accountMappings) {
    if (mapping.AccountId != id) continue;
    if (mapping.Team && !teams.has(mapping.Team)) teams.add(mapping.Team);
    if (mapping.Environment && !environments.has(mapping.Environment)) environments.add(mapping.Environment);
    if (mapping.Tenant?.Id && !seenTenantIds.has(mapping.Tenant.Id)) {
      seenTenantIds.add(mapping.Tenant.Id);
      tenants.push(mapping.Tenant);
    }
  }

  const result = {
    environments: Array.from(environments),
    teams: teams.size == 0 ? ['Unknown'] : Array.from(teams),
    tenants
  };

  logger.debug('getDetailsByAccountId: Legacy lookup result', {
    accountId: id,
    teams: result.teams,
    found: teams.size > 0
  });

  return result;
}


function getDetailsForAllAccounts(db) {
  // Log config status on first call
  const tenants = config.get('tenants', null);
  const platformContacts = config.get('platform_contacts', null);

  logger.info('getDetailsForAllAccounts: Creating account details resolver', {
    hasTenants: !!tenants,
    tenantsType: tenants === null ? 'null' : (tenants === undefined ? 'undefined' : typeof tenants),
    tenantCount: tenants ? Object.keys(tenants).length : 0,
    hasPlatformContacts: !!platformContacts,
    platformContactsType: platformContacts === null ? 'null' : (platformContacts === undefined ? 'undefined' : typeof platformContacts),
    platformContactCount: platformContacts ? Object.keys(platformContacts).length : 0
  });

  return {
    findByAccountId: (account_id) => {
      const result = getDetailsByAccountId(account_id, db);

      // Verbose logging to debug teams issue
      logger.debug('getDetailsForAllAccounts.findByAccountId: Result', {
        account_id: redactAccountId(account_id),
        resultType: typeof result,
        resultIsNull: result === null,
        resultIsUndefined: result === undefined,
        resultKeys: result ? Object.keys(result) : [],
        hasTeamsProperty: result ? ('teams' in result) : false,
        teamsValue: result?.teams,
        teamsType: result?.teams === undefined ? 'undefined' : (result?.teams === null ? 'null' : (Array.isArray(result?.teams) ? 'array' : typeof result?.teams)),
        teamsLength: Array.isArray(result?.teams) ? result.teams.length : 'N/A'
      });

      return result;
    }
  };
}

/**
 * Clear the cached index (useful for testing or config reload)
 */
function clearCache() {
  logger.debug('getDetailsByAccountId: Clearing account lookup cache');
  accountLookupIndex = null;
}

module.exports = {
  getDetailsByAccountId,
  getDetailsForAllAccounts,
  clearCache
};
