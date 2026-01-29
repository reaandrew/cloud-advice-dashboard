/**
 * Mock data for database collections
 * Used for local development when MongoDB is not available
 */

const year = 2024;
const month = 1;
const day = 15;

// Mock RDS database instances
// Note: queries expect Configuration.configuration with lowercase field names
const mockRdsInstances = [
  {
    resource_id: 'arn:aws:rds:us-east-1:123456789012:db:test-postgres-1',
    account_id: '123456789012',
    year, month, day,
    Configuration: {
      configuration: {
        engine: 'postgres',
        engineVersion: '13.4',
        dbInstanceIdentifier: 'test-postgres-1',
        dbInstanceClass: 'db.t3.medium',
        dbInstanceStatus: 'available',
        allocatedStorage: 20,
        storageType: 'gp2',
        multiAZ: false,
        publiclyAccessible: false,
        storageEncrypted: true,
        availabilityZone: 'us-east-1a',
        endpoint: {
          address: 'test-postgres-1.abcdef123456.us-east-1.rds.amazonaws.com',
          port: 5432
        }
      }
    }
  },
  {
    resource_id: 'arn:aws:rds:us-east-1:123456789012:db:test-mysql-1',
    account_id: '123456789012',
    year, month, day,
    Configuration: {
      configuration: {
        engine: 'mysql',
        engineVersion: '8.0.27',
        dbInstanceIdentifier: 'test-mysql-1',
        dbInstanceClass: 'db.t3.large',
        dbInstanceStatus: 'available',
        allocatedStorage: 50,
        storageType: 'gp2',
        multiAZ: true,
        publiclyAccessible: false,
        storageEncrypted: true,
        availabilityZone: 'us-east-1b',
        endpoint: {
          address: 'test-mysql-1.abcdef123456.us-east-1.rds.amazonaws.com',
          port: 3306
        }
      }
    }
  },
  {
    resource_id: 'arn:aws:rds:us-east-1:987654321098:db:prod-postgres-1',
    account_id: '987654321098',
    year, month, day,
    Configuration: {
      configuration: {
        engine: 'postgres',
        engineVersion: '12.9',
        dbInstanceIdentifier: 'prod-postgres-1',
        dbInstanceClass: 'db.m5.large',
        dbInstanceStatus: 'available',
        allocatedStorage: 100,
        storageType: 'gp2',
        multiAZ: true,
        publiclyAccessible: false,
        storageEncrypted: true,
        availabilityZone: 'us-east-1c',
        endpoint: {
          address: 'prod-postgres-1.abcdef123456.us-east-1.rds.amazonaws.com',
          port: 5432
        }
      }
    }
  },
  {
    resource_id: 'arn:aws:rds:us-east-1:987654321098:db:dev-mysql-1',
    account_id: '987654321098',
    year, month, day,
    Configuration: {
      configuration: {
        engine: 'mysql',
        engineVersion: '5.7.38',
        dbInstanceIdentifier: 'dev-mysql-1',
        dbInstanceClass: 'db.t2.small',
        dbInstanceStatus: 'available',
        allocatedStorage: 20,
        storageType: 'standard',
        multiAZ: false,
        publiclyAccessible: true,
        storageEncrypted: false,
        availabilityZone: 'us-east-1a',
        endpoint: {
          address: 'dev-mysql-1.abcdef123456.us-east-1.rds.amazonaws.com',
          port: 3306
        }
      }
    }
  }
];

// Mock Redshift clusters
const mockRedshiftClusters = [
  {
    resource_id: 'arn:aws:redshift:us-east-1:123456789012:cluster:test-redshift-1',
    account_id: '123456789012',
    year, month, day,
    Configuration: {
      configuration: {
        clusterIdentifier: 'test-redshift-1',
        clusterVersion: '1.0',
        nodeType: 'dc2.large',
        clusterStatus: 'available',
        numberOfNodes: 2,
        publiclyAccessible: false,
        encrypted: true,
        availabilityZone: 'us-east-1a',
        endpoint: {
          address: 'test-redshift-1.abcdef123456.us-east-1.redshift.amazonaws.com',
          port: 5439
        },
        totalStorageCapacityInMegaBytes: 400000
      }
    }
  },
  {
    resource_id: 'arn:aws:redshift:us-east-1:987654321098:cluster:prod-redshift-1',
    account_id: '987654321098',
    year, month, day,
    Configuration: {
      configuration: {
        clusterIdentifier: 'prod-redshift-1',
        clusterVersion: '1.0',
        nodeType: 'ra3.4xlarge',
        clusterStatus: 'available',
        numberOfNodes: 4,
        publiclyAccessible: false,
        encrypted: true,
        availabilityZone: 'us-east-1b',
        endpoint: {
          address: 'prod-redshift-1.abcdef123456.us-east-1.redshift.amazonaws.com',
          port: 5439
        },
        totalStorageCapacityInMegaBytes: 1024000
      }
    }
  },
  {
    resource_id: 'arn:aws:redshift:us-east-1:987654321098:cluster:dev-redshift-1',
    account_id: '987654321098',
    year, month, day,
    Configuration: {
      configuration: {
        clusterIdentifier: 'dev-redshift-1',
        clusterVersion: '1.0',
        nodeType: 'dc2.large',
        clusterStatus: 'available',
        numberOfNodes: 1,
        publiclyAccessible: true,
        encrypted: false,
        availabilityZone: 'us-east-1c',
        endpoint: {
          address: 'dev-redshift-1.abcdef123456.us-east-1.redshift.amazonaws.com',
          port: 5439
        },
        totalStorageCapacityInMegaBytes: 160000
      }
    }
  }
];

// Export the mock data
module.exports = {
  mockRdsInstances,
  mockRedshiftClusters
};
