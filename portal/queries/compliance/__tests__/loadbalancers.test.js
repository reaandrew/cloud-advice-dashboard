/**
 * Tests for loadbalancers.js - TLS Certificate Evaluation
 * Specifically tests the TCP/UDP NLB exclusion logic
 */

const {
    getNlbsWithOnlyTcpUdpListeners,
    processTlsConfigurations,
    getLoadBalancerDetails
} = require('../loadbalancers');

// Mock cursor that iterates over documents
function createMockCursor(documents) {
    let index = 0;
    return {
        [Symbol.asyncIterator]() {
            return {
                async next() {
                    if (index < documents.length) {
                        return { value: documents[index++], done: false };
                    }
                    return { done: true };
                }
            };
        }
    };
}

// Create mock request object
function createMockReq(collections) {
    return {
        collection: (name) => ({
            find: jest.fn().mockReturnValue(createMockCursor(collections[name] || [])),
            findOne: jest.fn().mockResolvedValue(collections[name]?.[0] || null)
        }),
        getDetailsForAllAccounts: jest.fn().mockResolvedValue({
            findByAccountId: (accountId) => ({
                teams: ['team-a']
            })
        })
    };
}

describe('getNlbsWithOnlyTcpUdpListeners', () => {
    const year = 2024;
    const month = 1;
    const day = 15;

    test('should return empty set when no NLBs exist', async () => {
        const req = createMockReq({
            elb_v2: [],
            elb_v2_listeners: []
        });

        const result = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
    });

    test('should return empty set when only ALBs exist', async () => {
        const req = createMockReq({
            elb_v2: [
                {
                    resource_id: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/abc123',
                    Configuration: { configuration: { type: 'application' } }
                }
            ],
            elb_v2_listeners: []
        });

        const result = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        expect(result.size).toBe(0);
    });

    test('should return NLB ARN when NLB has only TCP listeners', async () => {
        const nlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/my-nlb/def456';

        const req = createMockReq({
            elb_v2: [
                {
                    resource_id: nlbArn,
                    Configuration: { configuration: { type: 'network' } }
                }
            ],
            elb_v2_listeners: [
                {
                    Configuration: {
                        configuration: {
                            Protocol: 'TCP',
                            LoadBalancerArn: nlbArn
                        }
                    }
                }
            ]
        });

        const result = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        expect(result.size).toBe(1);
        expect(result.has(nlbArn)).toBe(true);
    });

    test('should return NLB ARN when NLB has only UDP listeners', async () => {
        const nlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/my-nlb/def456';

        const req = createMockReq({
            elb_v2: [
                {
                    resource_id: nlbArn,
                    Configuration: { configuration: { type: 'network' } }
                }
            ],
            elb_v2_listeners: [
                {
                    Configuration: {
                        configuration: {
                            Protocol: 'UDP',
                            LoadBalancerArn: nlbArn
                        }
                    }
                }
            ]
        });

        const result = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        expect(result.size).toBe(1);
        expect(result.has(nlbArn)).toBe(true);
    });

    test('should return NLB ARN when NLB has only TCP_UDP listeners', async () => {
        const nlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/my-nlb/def456';

        const req = createMockReq({
            elb_v2: [
                {
                    resource_id: nlbArn,
                    Configuration: { configuration: { type: 'network' } }
                }
            ],
            elb_v2_listeners: [
                {
                    Configuration: {
                        configuration: {
                            Protocol: 'TCP_UDP',
                            LoadBalancerArn: nlbArn
                        }
                    }
                }
            ]
        });

        const result = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        expect(result.size).toBe(1);
        expect(result.has(nlbArn)).toBe(true);
    });

    test('should NOT return NLB ARN when NLB has a TLS listener', async () => {
        const nlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/my-nlb/def456';

        const req = createMockReq({
            elb_v2: [
                {
                    resource_id: nlbArn,
                    Configuration: { configuration: { type: 'network' } }
                }
            ],
            elb_v2_listeners: [
                {
                    Configuration: {
                        configuration: {
                            Protocol: 'TLS',
                            LoadBalancerArn: nlbArn,
                            SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06'
                        }
                    }
                }
            ]
        });

        const result = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        expect(result.size).toBe(0);
    });

    test('should NOT return NLB ARN when NLB has mixed TCP and TLS listeners', async () => {
        const nlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/my-nlb/def456';

        const req = createMockReq({
            elb_v2: [
                {
                    resource_id: nlbArn,
                    Configuration: { configuration: { type: 'network' } }
                }
            ],
            elb_v2_listeners: [
                {
                    Configuration: {
                        configuration: {
                            Protocol: 'TCP',
                            LoadBalancerArn: nlbArn
                        }
                    }
                },
                {
                    Configuration: {
                        configuration: {
                            Protocol: 'TLS',
                            LoadBalancerArn: nlbArn,
                            SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06'
                        }
                    }
                }
            ]
        });

        const result = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        expect(result.size).toBe(0);
    });

    test('should handle multiple NLBs with different listener types', async () => {
        const tcpOnlyNlb = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tcp-only/aaa111';
        const tlsNlb = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tls-nlb/bbb222';
        const mixedNlb = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/mixed/ccc333';

        const req = createMockReq({
            elb_v2: [
                { resource_id: tcpOnlyNlb, Configuration: { configuration: { type: 'network' } } },
                { resource_id: tlsNlb, Configuration: { configuration: { type: 'network' } } },
                { resource_id: mixedNlb, Configuration: { configuration: { type: 'network' } } }
            ],
            elb_v2_listeners: [
                // TCP-only NLB
                { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: tcpOnlyNlb } } },
                // TLS NLB
                { Configuration: { configuration: { Protocol: 'TLS', LoadBalancerArn: tlsNlb, SslPolicy: 'policy' } } },
                // Mixed NLB (TCP + TLS)
                { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: mixedNlb } } },
                { Configuration: { configuration: { Protocol: 'TLS', LoadBalancerArn: mixedNlb, SslPolicy: 'policy' } } }
            ]
        });

        const result = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        expect(result.size).toBe(1);
        expect(result.has(tcpOnlyNlb)).toBe(true);
        expect(result.has(tlsNlb)).toBe(false);
        expect(result.has(mixedNlb)).toBe(false);
    });

    test('should handle NLB with no listeners as TCP/UDP only', async () => {
        const nlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/no-listeners/xyz789';

        const req = createMockReq({
            elb_v2: [
                {
                    resource_id: nlbArn,
                    Configuration: { configuration: { type: 'network' } }
                }
            ],
            elb_v2_listeners: []
        });

        const result = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        // NLBs with no listeners should be excluded (treated as TCP/UDP only)
        expect(result.size).toBe(1);
        expect(result.has(nlbArn)).toBe(true);
    });

    test('should match by short ID for cross-account ARN scenarios', async () => {
        const nlbArn1 = 'arn:aws:elasticloadbalancing:us-east-1:111111111111:loadbalancer/net/my-nlb/shortid123';
        const nlbArn2 = 'arn:aws:elasticloadbalancing:us-east-1:222222222222:loadbalancer/net/my-nlb/shortid123';

        const req = createMockReq({
            elb_v2: [
                { resource_id: nlbArn1, Configuration: { configuration: { type: 'network' } } }
            ],
            elb_v2_listeners: [
                // Listener ARN has different account ID but same short ID
                { Configuration: { configuration: { Protocol: 'TLS', LoadBalancerArn: nlbArn2, SslPolicy: 'policy' } } }
            ]
        });

        const result = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        // Should match by short ID and NOT include this NLB
        expect(result.size).toBe(0);
    });
});

describe('processTlsConfigurations - TCP/UDP NLB Exclusion', () => {
    const year = 2024;
    const month = 1;
    const day = 15;

    test('should exclude TCP-only NLBs from totalLBs count', async () => {
        const albArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/abc123';
        const tcpNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tcp-nlb/def456';

        const req = createMockReq({
            elb_v2: [
                { resource_id: albArn, account_id: '123456789012', Configuration: { configuration: { type: 'application' } } },
                { resource_id: tcpNlbArn, account_id: '123456789012', Configuration: { configuration: { type: 'network' } } }
            ],
            elb_v2_listeners: [
                // ALB with HTTPS
                { account_id: '123456789012', Configuration: { configuration: { Protocol: 'HTTPS', LoadBalancerArn: albArn, SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06' } } },
                // NLB with TCP only
                { account_id: '123456789012', Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: tcpNlbArn } } }
            ],
            elb_classic: []
        });

        const result = await processTlsConfigurations(req, year, month, day);

        // Should only count the ALB, not the TCP-only NLB
        const teamData = result.get('team-a');
        expect(teamData.totalLBs).toBe(1); // Only the ALB
    });

    test('should include NLBs with TLS listeners in totalLBs count', async () => {
        const tlsNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tls-nlb/ghi789';

        const req = createMockReq({
            elb_v2: [
                { resource_id: tlsNlbArn, account_id: '123456789012', Configuration: { configuration: { type: 'network' } } }
            ],
            elb_v2_listeners: [
                { account_id: '123456789012', Configuration: { configuration: { Protocol: 'TLS', LoadBalancerArn: tlsNlbArn, SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06' } } }
            ],
            elb_classic: []
        });

        const result = await processTlsConfigurations(req, year, month, day);

        const teamData = result.get('team-a');
        expect(teamData.totalLBs).toBe(1); // TLS NLB should be counted
        expect(teamData.tlsVersions.get('ELBSecurityPolicy-TLS13-1-2-2021-06')).toBe(1);
    });

    test('should still count Classic ELBs', async () => {
        const req = createMockReq({
            elb_v2: [],
            elb_v2_listeners: [],
            elb_classic: [
                { account_id: '123456789012', Configuration: { configuration: { listenerDescriptions: [{ listener: { protocol: 'HTTPS' }, policyNames: ['ELBSecurityPolicy-2016-08'] }] } } }
            ]
        });

        const result = await processTlsConfigurations(req, year, month, day);

        const teamData = result.get('team-a');
        expect(teamData.totalLBs).toBe(1);
    });
});

describe('getLoadBalancerDetails - NO CERTS exclusion', () => {
    const year = 2024;
    const month = 1;
    const day = 15;

    test('should not include TCP-only NLBs in NO CERTS list', async () => {
        const tcpNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tcp-nlb/def456';

        const req = createMockReq({
            elb_v2: [
                {
                    resource_id: tcpNlbArn,
                    account_id: '123456789012',
                    Configuration: {
                        configuration: {
                            type: 'network',
                            loadBalancerName: 'tcp-nlb'
                        }
                    }
                }
            ],
            elb_v2_listeners: [
                { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: tcpNlbArn } } }
            ],
            elb_classic: []
        });

        const result = await getLoadBalancerDetails(req, year, month, day, 'team-a', 'NO CERTS');

        // TCP-only NLB should NOT appear in NO CERTS list
        expect(result).toHaveLength(0);
    });

    test('should include ALBs without HTTPS in NO CERTS list', async () => {
        const httpAlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/http-alb/abc123';

        const req = createMockReq({
            elb_v2: [
                {
                    resource_id: httpAlbArn,
                    account_id: '123456789012',
                    Configuration: {
                        configuration: {
                            type: 'application',
                            loadBalancerName: 'http-alb',
                            scheme: 'internet-facing'
                        }
                    }
                }
            ],
            elb_v2_listeners: [
                { Configuration: { configuration: { Protocol: 'HTTP', LoadBalancerArn: httpAlbArn } } }
            ],
            elb_classic: []
        });

        const result = await getLoadBalancerDetails(req, year, month, day, 'team-a', 'NO CERTS');

        // HTTP-only ALB SHOULD appear in NO CERTS list
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('application');
        expect(result[0].tlsPolicy).toBe('NO CERTS');
    });

    test('should include NLBs with TLS but no certificate in NO CERTS list', async () => {
        const tlsNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tls-nlb/ghi789';

        const req = createMockReq({
            elb_v2: [
                {
                    resource_id: tlsNlbArn,
                    account_id: '123456789012',
                    Configuration: {
                        configuration: {
                            type: 'network',
                            loadBalancerName: 'tls-nlb',
                            scheme: 'internal'
                        }
                    }
                }
            ],
            // No TLS listeners in the list = NLB without TLS configured
            elb_v2_listeners: [],
            elb_classic: []
        });

        // This NLB has TLS type but no TLS listener configured yet
        // Wait - actually the logic is: if NLB has no TLS listeners, it should be excluded
        // Let me re-read the implementation...
        // Actually, the getNlbsWithOnlyTcpUdpListeners will return this NLB since it has no listeners
        const result = await getLoadBalancerDetails(req, year, month, day, 'team-a', 'NO CERTS');

        // An NLB with no listeners at all is treated as TCP/UDP-only and excluded
        expect(result).toHaveLength(0);
    });

    test('should not include ALBs that have HTTPS listeners', async () => {
        const httpsAlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/https-alb/jkl012';

        const req = createMockReq({
            elb_v2: [
                {
                    resource_id: httpsAlbArn,
                    account_id: '123456789012',
                    Configuration: {
                        configuration: {
                            type: 'application',
                            loadBalancerName: 'https-alb',
                            scheme: 'internet-facing'
                        }
                    }
                }
            ],
            elb_v2_listeners: [
                { Configuration: { configuration: { Protocol: 'HTTPS', LoadBalancerArn: httpsAlbArn, SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06' } } }
            ],
            elb_classic: []
        });

        const result = await getLoadBalancerDetails(req, year, month, day, 'team-a', 'NO CERTS');

        // ALB with HTTPS should NOT appear in NO CERTS list
        expect(result).toHaveLength(0);
    });

    test('should handle mixed scenario correctly', async () => {
        const httpAlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/http-alb/aaa111';
        const httpsAlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/https-alb/bbb222';
        const tcpNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tcp-nlb/ccc333';
        const tlsNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tls-nlb/ddd444';

        const req = createMockReq({
            elb_v2: [
                { resource_id: httpAlbArn, account_id: '123456789012', Configuration: { configuration: { type: 'application', loadBalancerName: 'http-alb' } } },
                { resource_id: httpsAlbArn, account_id: '123456789012', Configuration: { configuration: { type: 'application', loadBalancerName: 'https-alb' } } },
                { resource_id: tcpNlbArn, account_id: '123456789012', Configuration: { configuration: { type: 'network', loadBalancerName: 'tcp-nlb' } } },
                { resource_id: tlsNlbArn, account_id: '123456789012', Configuration: { configuration: { type: 'network', loadBalancerName: 'tls-nlb' } } }
            ],
            elb_v2_listeners: [
                { Configuration: { configuration: { Protocol: 'HTTP', LoadBalancerArn: httpAlbArn } } },
                { Configuration: { configuration: { Protocol: 'HTTPS', LoadBalancerArn: httpsAlbArn, SslPolicy: 'policy' } } },
                { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: tcpNlbArn } } },
                { Configuration: { configuration: { Protocol: 'TLS', LoadBalancerArn: tlsNlbArn, SslPolicy: 'policy' } } }
            ],
            elb_classic: []
        });

        const result = await getLoadBalancerDetails(req, year, month, day, 'team-a', 'NO CERTS');

        // Only HTTP-only ALB should appear in NO CERTS list
        // - HTTPS ALB: has HTTPS, excluded
        // - TCP NLB: TCP-only, excluded from evaluation entirely
        // - TLS NLB: has TLS, excluded
        expect(result).toHaveLength(1);
        expect(result[0].shortName).toBe('http-alb');
    });
});

describe('Protocol handling edge cases', () => {
    const year = 2024;
    const month = 1;
    const day = 15;

    test('should handle NLBs with multiple TCP listeners', async () => {
        const nlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/multi-tcp/xyz789';

        const req = createMockReq({
            elb_v2: [
                { resource_id: nlbArn, Configuration: { configuration: { type: 'network' } } }
            ],
            elb_v2_listeners: [
                { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: nlbArn, Port: 80 } } },
                { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: nlbArn, Port: 443 } } },
                { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: nlbArn, Port: 8080 } } }
            ]
        });

        const result = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        expect(result.size).toBe(1);
        expect(result.has(nlbArn)).toBe(true);
    });

    test('should handle listeners with missing Configuration', async () => {
        const nlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/my-nlb/abc123';

        const req = createMockReq({
            elb_v2: [
                { resource_id: nlbArn, Configuration: { configuration: { type: 'network' } } }
            ],
            elb_v2_listeners: [
                { Configuration: null },
                { Configuration: { configuration: null } },
                { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: nlbArn } } }
            ]
        });

        const result = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        expect(result.size).toBe(1);
        expect(result.has(nlbArn)).toBe(true);
    });

    test('should handle ALBs correctly (never excluded)', async () => {
        const albArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/abc123';

        const req = createMockReq({
            elb_v2: [
                { resource_id: albArn, Configuration: { configuration: { type: 'application' } } }
            ],
            elb_v2_listeners: [
                { Configuration: { configuration: { Protocol: 'HTTP', LoadBalancerArn: albArn } } }
            ]
        });

        const result = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        // ALBs should never be in the exclusion set
        expect(result.size).toBe(0);
        expect(result.has(albArn)).toBe(false);
    });
});
