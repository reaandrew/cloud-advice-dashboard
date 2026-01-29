/**
 * Mock account mapping data
 * Used for local development when MongoDB is not available
 */

const mockAccounts = {
  '123456789012': {
    AccountId: '123456789012',
    Team: 'DevOps',
    teams: ['DevOps'],
    Environment: 'Production',
    environments: ['Production'],
    Tenant: {
      Id: 'DVOP001',
      Name: 'Core Services',
      Description: 'Core production services'
    },
    tenants: [{ Id: 'DVOP001', Name: 'Core Services', Description: 'Core production services' }]
  },
  '987654321098': {
    AccountId: '987654321098',
    Team: 'Platform',
    teams: ['Platform'],
    Environment: 'Development',
    environments: ['Development', 'Staging'],
    Tenant: {
      Id: 'PLAT002',
      Name: 'Platform Services',
      Description: 'Platform development and staging'
    },
    tenants: [{ Id: 'PLAT002', Name: 'Platform Services', Description: 'Platform development and staging' }]
  },
  '111222333444': {
    AccountId: '111222333444',
    Team: 'Security',
    teams: ['Security'],
    Environment: 'Testing',
    environments: ['Testing'],
    Tenant: {
      Id: 'SECU003',
      Name: 'Security Testing',
      Description: 'Security testing environment'
    },
    tenants: [{ Id: 'SECU003', Name: 'Security Testing', Description: 'Security testing environment' }]
  },
};

// Function to mock the getDetailsForAllAccounts middleware
function getDetailsForAllAccounts() {
  // The real implementation is async, so we need to return an async function
  // that returns an object with findByAccountId
  return async () => {
    return {
      findByAccountId: (account_id) => {
        // Convert account_id to string if it's not already
        const accountIdStr = String(account_id);

        // Return the mock data or a default if not found
        if (mockAccounts[accountIdStr]) {
          return mockAccounts[accountIdStr];
        } else {
          return {
            teams: ['Unknown'],
            environments: ['Unknown'],
            tenants: []
          };
        }
      }
    };
  };
}

module.exports = {
  mockAccounts,
  getDetailsForAllAccounts
};
