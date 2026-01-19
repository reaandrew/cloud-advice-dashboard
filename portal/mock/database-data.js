/**
 * Mock data for database collections
 * Used for local development when MongoDB is not available
 */

// Mock RDS database instances
const mockRdsInstances = [
  {
    resource_id: 'arn:aws:rds:us-east-1:123456789012:db:test-postgres-1',
    account_id: '123456789012',
    year: 2023,
    month: 12,
    day: 31,
    Configuration: {
      // Using correct AWS Config PascalCase field names
      Engine: 'postgres',
      EngineVersion: '13.4',
      DBInstanceIdentifier: 'test-postgres-1',
      DBInstanceClass: 'db.t3.medium',
      DBInstanceStatus: 'available',
      AllocatedStorage: 20,
      StorageType: 'gp2',
      MultiAZ: false,
      PubliclyAccessible: false,
      StorageEncrypted: true,
      AvailabilityZone: 'us-east-1a',
      Endpoint: {
        Address: 'test-postgres-1.abcdef123456.us-east-1.rds.amazonaws.com',
        Port: 5432
      }
    }
  },
  {
    resource_id: 'arn:aws:rds:us-east-1:123456789012:db:test-mysql-1',
    account_id: '123456789012',
    year: 2023,
    month: 12,
    day: 31,
    Configuration: {
      Engine: 'mysql',
      EngineVersion: '8.0.27',
      DBInstanceIdentifier: 'test-mysql-1',
      DBInstanceClass: 'db.t3.large',
      DBInstanceStatus: 'available',
      AllocatedStorage: 50,
      StorageType: 'gp2',
      MultiAZ: true,
      PubliclyAccessible: false,
      StorageEncrypted: true,
      AvailabilityZone: 'us-east-1b',
      Endpoint: {
        Address: 'test-mysql-1.abcdef123456.us-east-1.rds.amazonaws.com',
        Port: 3306
      }
    }
  },
  {
    resource_id: 'arn:aws:rds:us-east-1:987654321098:db:prod-postgres-1',
    account_id: '987654321098',
    year: 2023,
    month: 12,
    day: 31,
    Configuration: {
      Engine: 'postgres',
      EngineVersion: '12.9',
      DBInstanceIdentifier: 'prod-postgres-1',
      DBInstanceClass: 'db.m5.large',
      DBInstanceStatus: 'available',
      AllocatedStorage: 100,
      StorageType: 'gp2',
      MultiAZ: true,
      PubliclyAccessible: false,
      StorageEncrypted: true,
      AvailabilityZone: 'us-east-1c',
      Endpoint: {
        Address: 'prod-postgres-1.abcdef123456.us-east-1.rds.amazonaws.com',
        Port: 5432
      }
    }
  },
  // Example showing configuration with nested format for comparison
  {
    resource_id: 'arn:aws:rds:us-east-1:987654321098:db:dev-mysql-1',
    account_id: '987654321098',
    year: 2023,
    month: 12,
    day: 31,
    Configuration: {
      configuration: {
        Engine: 'mysql',
        EngineVersion: '5.7.38',
        DBInstanceIdentifier: 'dev-mysql-1',
        DBInstanceClass: 'db.t2.small',
        DBInstanceStatus: 'available',
        AllocatedStorage: 20,
        StorageType: 'standard',
        MultiAZ: false,
        PubliclyAccessible: true,
        StorageEncrypted: false,
        AvailabilityZone: 'us-east-1a',
        Endpoint: {
          Address: 'dev-mysql-1.abcdef123456.us-east-1.rds.amazonaws.com',
          Port: 3306
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
    year: 2023,
    month: 12,
    day: 31,
    Configuration: {
      ClusterIdentifier: 'test-redshift-1',
      ClusterVersion: '1.0',
      NodeType: 'dc2.large',
      ClusterStatus: 'available',
      NumberOfNodes: 2,
      PubliclyAccessible: false,
      Encrypted: true,
      AvailabilityZone: 'us-east-1a',
      Endpoint: {
        Address: 'test-redshift-1.abcdef123456.us-east-1.redshift.amazonaws.com',
        Port: 5439
      },
      TotalStorageCapacityInMegaBytes: 400000
    }
  },
  {
    resource_id: 'arn:aws:redshift:us-east-1:987654321098:cluster:prod-redshift-1',
    account_id: '987654321098',
    year: 2023,
    month: 12,
    day: 31,
    Configuration: {
      ClusterIdentifier: 'prod-redshift-1',
      ClusterVersion: '1.0',
      NodeType: 'ra3.4xlarge',
      ClusterStatus: 'available',
      NumberOfNodes: 4,
      PubliclyAccessible: false,
      Encrypted: true,
      AvailabilityZone: 'us-east-1b',
      Endpoint: {
        Address: 'prod-redshift-1.abcdef123456.us-east-1.redshift.amazonaws.com',
        Port: 5439
      },
      TotalStorageCapacityInMegaBytes: 1024000
    }
  },
  // Example showing configuration with nested format for comparison
  {
    resource_id: 'arn:aws:redshift:us-east-1:987654321098:cluster:dev-redshift-1',
    account_id: '987654321098',
    year: 2023,
    month: 12,
    day: 31,
    Configuration: {
      configuration: {
        ClusterIdentifier: 'dev-redshift-1',
        ClusterVersion: '1.0',
        NodeType: 'dc2.large',
        ClusterStatus: 'available',
        NumberOfNodes: 1,
        PubliclyAccessible: true,
        Encrypted: false,
        AvailabilityZone: 'us-east-1c',
        Endpoint: {
          Address: 'dev-redshift-1.abcdef123456.us-east-1.redshift.amazonaws.com',
          Port: 5439
        },
        TotalStorageCapacityInMegaBytes: 160000
      }
    }
  }
];

// Export the mock data
module.exports = {
  mockRdsInstances,
  mockRedshiftClusters
};