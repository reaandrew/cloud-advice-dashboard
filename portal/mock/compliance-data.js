/**
 * Mock data for compliance collections (tags, kms, autoscaling)
 * Used for local development when MongoDB is not available
 */

const year = 2024;
const month = 1;
const day = 15;

// Mock tags data
const mockTags = [
  {
    resource_id: 'arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0',
    account_id: '123456789012',
    year, month, day,
    Tags: {
      Name: 'web-server-1',
      MyCode: 'ABC123',
      Source: 'terraform',
      BSP: 'true',
      BillingID: 'BILL-001',
      Service: 'web-app'
    }
  },
  {
    resource_id: 'arn:aws:ec2:us-east-1:123456789012:instance/i-0987654321fedcba0',
    account_id: '123456789012',
    year, month, day,
    Tags: {
      Name: 'db-server-1',
      MyCode: 'DEF456'
      // Missing Source and BSP tags - non-compliant
    }
  },
  {
    resource_id: 'arn:aws:ec2:us-east-1:987654321098:instance/i-abcdef1234567890',
    account_id: '987654321098',
    year, month, day,
    Tags: {
      Name: 'app-server-1',
      MyCode: 'GHI789',
      Source: 'cloudformation',
      BSP: 'true',
      BillingID: 'BILL-002',
      Project: 'platform'
    }
  },
  {
    resource_id: 'arn:aws:s3:::my-bucket-123',
    account_id: '123456789012',
    year, month, day,
    Tags: {
      Name: 'my-bucket-123',
      MyCode: 'JKL012',
      Source: 'manual'
      // Missing BSP - non-compliant
    }
  }
];

// Mock KMS keys data
const mockKmsKeys = [
  {
    resource_id: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
    account_id: '123456789012',
    year, month, day,
    Configuration: {
      configuration: {
        keyId: '12345678-1234-1234-1234-123456789012',
        keyState: 'Enabled',
        keyManager: 'CUSTOMER',
        keyRotationStatus: true,
        description: 'Production encryption key'
      }
    }
  },
  {
    resource_id: 'arn:aws:kms:us-east-1:123456789012:key/87654321-4321-4321-4321-210987654321',
    account_id: '123456789012',
    year, month, day,
    Configuration: {
      configuration: {
        keyId: '87654321-4321-4321-4321-210987654321',
        keyState: 'Enabled',
        keyManager: 'CUSTOMER',
        keyRotationStatus: false, // Not rotated - non-compliant
        description: 'Development encryption key'
      }
    }
  },
  {
    resource_id: 'arn:aws:kms:us-east-1:987654321098:key/abcdefab-abcd-abcd-abcd-abcdefabcdef',
    account_id: '987654321098',
    year, month, day,
    Configuration: {
      configuration: {
        keyId: 'abcdefab-abcd-abcd-abcd-abcdefabcdef',
        keyState: 'Enabled',
        keyManager: 'CUSTOMER',
        keyRotationStatus: true,
        description: 'Platform encryption key'
      }
    }
  }
];

// Mock KMS key metadata
const mockKmsKeyMetadata = [
  {
    resource_id: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
    account_id: '123456789012',
    year, month, day,
    Configuration: {
      KeyId: '12345678-1234-1234-1234-123456789012',
      KeyState: 'Enabled',
      KeyManager: 'CUSTOMER'
    }
  }
];

// Mock autoscaling groups data
const mockAutoscalingGroups = [
  {
    resource_id: 'arn:aws:autoscaling:us-east-1:123456789012:autoScalingGroup:12345678-1234-1234-1234-123456789012:autoScalingGroupName/web-asg',
    account_id: '123456789012',
    year, month, day,
    Configuration: {
      configuration: {
        autoScalingGroupName: 'web-asg',
        minSize: 2,
        maxSize: 10,
        desiredCapacity: 4,
        launchTemplate: {
          launchTemplateId: 'lt-0123456789abcdef0',
          version: '$Latest'
        },
        instances: [
          { instanceId: 'i-1234567890abcdef0', healthStatus: 'Healthy' },
          { instanceId: 'i-0987654321fedcba0', healthStatus: 'Healthy' }
        ]
      }
    }
  },
  {
    resource_id: 'arn:aws:autoscaling:us-east-1:987654321098:autoScalingGroup:87654321-4321-4321-4321-210987654321:autoScalingGroupName/app-asg',
    account_id: '987654321098',
    year, month, day,
    Configuration: {
      configuration: {
        autoScalingGroupName: 'app-asg',
        minSize: 1,
        maxSize: 5,
        desiredCapacity: 2,
        launchConfigurationName: 'legacy-launch-config', // Using legacy launch config - non-compliant
        instances: [
          { instanceId: 'i-abcdef1234567890', healthStatus: 'Healthy' }
        ]
      }
    }
  }
];

module.exports = {
  mockTags,
  mockKmsKeys,
  mockKmsKeyMetadata,
  mockAutoscalingGroups
};
