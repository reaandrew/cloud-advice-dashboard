/**
 * Mock data for load balancer collections
 * Used for local development when MongoDB is not available
 */

const year = 2024;
const month = 1;
const day = 15;

// Mock ELB v2 (ALB/NLB) data
const mockElbV2 = [
  {
    resource_id: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb-1/abc123',
    account_id: '123456789012',
    year, month, day,
    Configuration: {
      configuration: {
        type: 'application',
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb-1/abc123',
        loadBalancerName: 'my-alb-1',
        scheme: 'internet-facing',
        state: { code: 'active' }
      }
    }
  },
  {
    resource_id: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb-2/def456',
    account_id: '123456789012',
    year, month, day,
    Configuration: {
      configuration: {
        type: 'application',
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb-2/def456',
        loadBalancerName: 'my-alb-2',
        scheme: 'internal',
        state: { code: 'active' }
      }
    }
  },
  {
    resource_id: 'arn:aws:elasticloadbalancing:us-east-1:987654321098:loadbalancer/net/my-nlb-1/ghi789',
    account_id: '987654321098',
    year, month, day,
    Configuration: {
      configuration: {
        type: 'network',
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:987654321098:loadbalancer/net/my-nlb-1/ghi789',
        loadBalancerName: 'my-nlb-1',
        scheme: 'internet-facing',
        state: { code: 'active' }
      }
    }
  },
  {
    resource_id: 'arn:aws:elasticloadbalancing:us-east-1:987654321098:loadbalancer/net/tcp-only-nlb/jkl012',
    account_id: '987654321098',
    year, month, day,
    Configuration: {
      configuration: {
        type: 'network',
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:987654321098:loadbalancer/net/tcp-only-nlb/jkl012',
        loadBalancerName: 'tcp-only-nlb',
        scheme: 'internal',
        state: { code: 'active' }
      }
    }
  }
];

// Mock ELB v2 listeners
const mockElbV2Listeners = [
  {
    resource_id: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-alb-1/abc123/listener1',
    account_id: '123456789012',
    year, month, day,
    Configuration: {
      configuration: {
        listenerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-alb-1/abc123/listener1',
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb-1/abc123',
        port: 443,
        protocol: 'HTTPS',
        certificates: [
          { certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/cert-123' }
        ]
      }
    }
  },
  {
    resource_id: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-alb-2/def456/listener2',
    account_id: '123456789012',
    year, month, day,
    Configuration: {
      configuration: {
        listenerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-alb-2/def456/listener2',
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb-2/def456',
        port: 443,
        protocol: 'HTTPS',
        certificates: [
          { certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/cert-456' }
        ]
      }
    }
  },
  {
    resource_id: 'arn:aws:elasticloadbalancing:us-east-1:987654321098:listener/net/my-nlb-1/ghi789/listener3',
    account_id: '987654321098',
    year, month, day,
    Configuration: {
      configuration: {
        listenerArn: 'arn:aws:elasticloadbalancing:us-east-1:987654321098:listener/net/my-nlb-1/ghi789/listener3',
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:987654321098:loadbalancer/net/my-nlb-1/ghi789',
        port: 443,
        protocol: 'TLS',
        certificates: [
          { certificateArn: 'arn:aws:acm:us-east-1:987654321098:certificate/cert-789' }
        ]
      }
    }
  },
  {
    resource_id: 'arn:aws:elasticloadbalancing:us-east-1:987654321098:listener/net/tcp-only-nlb/jkl012/listener4',
    account_id: '987654321098',
    year, month, day,
    Configuration: {
      configuration: {
        listenerArn: 'arn:aws:elasticloadbalancing:us-east-1:987654321098:listener/net/tcp-only-nlb/jkl012/listener4',
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:987654321098:loadbalancer/net/tcp-only-nlb/jkl012',
        port: 80,
        protocol: 'TCP'
      }
    }
  }
];

// Mock Classic ELB data
const mockElbClassic = [
  {
    resource_id: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/classic-elb-1',
    account_id: '123456789012',
    year, month, day,
    Configuration: {
      configuration: {
        loadBalancerName: 'classic-elb-1',
        scheme: 'internet-facing',
        listenerDescriptions: [
          { listener: { protocol: 'HTTPS', loadBalancerPort: 443 } }
        ]
      }
    }
  }
];

// Mock ELB v2 target groups
const mockElbV2TargetGroups = [
  {
    resource_id: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-targets/abc123',
    account_id: '123456789012',
    year, month, day,
    Configuration: {
      configuration: {
        targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-targets/abc123',
        targetGroupName: 'my-targets',
        protocol: 'HTTP',
        port: 80,
        targetType: 'instance'
      }
    }
  }
];

module.exports = {
  mockElbV2,
  mockElbV2Listeners,
  mockElbClassic,
  mockElbV2TargetGroups
};
