/**
 * Mock account mapping data
 * Used for local development when MongoDB is not available
 */

const mockAccounts = {
  // Map of account IDs to their details
  '123456789012': {
    teams: ['Team Alpha', 'DevOps'],
    environments: ['Production'],
    tenants: [
      {
        Id: 'tenant-123456789012',
        Name: 'Core Services',
        Description: 'Core production services'
      }
    ]
  },
  '987654321098': {
    teams: ['Team Beta', 'Infrastructure'],
    environments: ['Development', 'Staging'],
    tenants: [
      {
        Id: 'tenant-987654321098',
        Name: 'Platform Services',
        Description: 'Platform development and staging'
      }
    ]
  },
  '111222333444': {
    teams: ['Team Gamma', 'Security'],
    environments: ['Testing'],
    tenants: [
      {
        Id: 'tenant-111222333444',
        Name: 'Security Testing',
        Description: 'Security testing environment'
      }
    ]
  },
};

// Function to mock the getDetailsForAllAccounts middleware
function getDetailsForAllAccounts() {
  return {
    findByAccountId: (account_id) => {
      // Use a proper logger
      const logger = require('../libs/logger');

      logger.debug(`Mock finding account details for: ${account_id}`);

      // Convert account_id to string if it's not already
      const accountIdStr = String(account_id);

      // Return the mock data or a default if not found
      if (mockAccounts[accountIdStr]) {
        logger.debug(`Found mock data for account ID: ${accountIdStr}`);
        return mockAccounts[accountIdStr];
      } else {
        logger.debug(`No mock data for account ID: ${accountIdStr}, returning default`);
        return {
          teams: ['Unknown'],
          environments: ['Unknown'],
          tenants: []
        };
      }
    }
  };
}

module.exports = {
  mockAccounts,
  getDetailsForAllAccounts
};