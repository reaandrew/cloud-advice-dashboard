/**
 * Tests for secure-loadbalancers.js Dashboard Metric
 * Specifically tests the TCP/UDP NLB exclusion logic
 */

const SecureLoadBalancersMetric = require('../secure-loadbalancers');

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
            find: jest.fn().mockReturnValue(createMockCursor(collections[name] || []))
        })
    };
}

describe('SecureLoadBalancersMetric', () => {
    let metric;
    const year = 2024;
    const month = 1;
    const day = 15;

    beforeEach(() => {
        metric = new SecureLoadBalancersMetric();
    });

    describe('constructor', () => {
        test('should have correct metadata', () => {
            expect(metric.id).toBe('secure-loadbalancers');
            expect(metric.title).toBe('Secure Load Balancers');
            expect(metric.category).toBe('security');
        });
    });

    describe('_getNlbsWithOnlyTcpUdpListeners', () => {
        test('should return empty set when no NLBs exist', async () => {
            const req = createMockReq({
                elb_v2: [],
                elb_v2_listeners: []
            });

            const result = await metric._getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

            expect(result).toBeInstanceOf(Set);
            expect(result.size).toBe(0);
        });

        test('should return NLB when it has only TCP listeners', async () => {
            const nlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/my-nlb/def456';

            const req = createMockReq({
                elb_v2: [
                    { resource_id: nlbArn, Configuration: { configuration: { type: 'network' } } }
                ],
                elb_v2_listeners: [
                    { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: nlbArn } } }
                ]
            });

            const result = await metric._getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

            expect(result.size).toBe(1);
            expect(result.has(nlbArn)).toBe(true);
        });

        test('should NOT return NLB when it has TLS listener', async () => {
            const nlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/my-nlb/def456';

            const req = createMockReq({
                elb_v2: [
                    { resource_id: nlbArn, Configuration: { configuration: { type: 'network' } } }
                ],
                elb_v2_listeners: [
                    { Configuration: { configuration: { Protocol: 'TLS', LoadBalancerArn: nlbArn } } }
                ]
            });

            const result = await metric._getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

            expect(result.size).toBe(0);
        });
    });

    describe('calculate', () => {
        test('should return N/A when no load balancers exist', async () => {
            const req = createMockReq({
                elb_v2: [],
                elb_v2_listeners: [],
                elb_classic: []
            });

            const result = await metric.calculate(req, year, month, day);

            expect(result).toBe('N/A');
        });

        test('should return 100 when all load balancers are secure', async () => {
            const albArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/abc123';

            const req = createMockReq({
                elb_v2: [
                    { resource_id: albArn, Configuration: { configuration: { type: 'application' } } }
                ],
                elb_v2_listeners: [
                    { Configuration: { configuration: { Protocol: 'HTTPS', LoadBalancerArn: albArn } } }
                ],
                elb_classic: []
            });

            const result = await metric.calculate(req, year, month, day);

            expect(result).toBe(100);
        });

        test('should exclude TCP-only NLBs from calculation', async () => {
            const albArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/abc123';
            const tcpNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tcp-nlb/def456';

            const req = createMockReq({
                elb_v2: [
                    { resource_id: albArn, Configuration: { configuration: { type: 'application' } } },
                    { resource_id: tcpNlbArn, Configuration: { configuration: { type: 'network' } } }
                ],
                elb_v2_listeners: [
                    { Configuration: { configuration: { Protocol: 'HTTPS', LoadBalancerArn: albArn } } },
                    { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: tcpNlbArn } } }
                ],
                elb_classic: []
            });

            const result = await metric.calculate(req, year, month, day);

            // Only ALB counted, and it has HTTPS = 100%
            expect(result).toBe(100);
        });

        test('should include NLBs with TLS in calculation', async () => {
            const tlsNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tls-nlb/ghi789';

            const req = createMockReq({
                elb_v2: [
                    { resource_id: tlsNlbArn, Configuration: { configuration: { type: 'network' } } }
                ],
                elb_v2_listeners: [
                    { Configuration: { configuration: { Protocol: 'TLS', LoadBalancerArn: tlsNlbArn } } }
                ],
                elb_classic: []
            });

            const result = await metric.calculate(req, year, month, day);

            expect(result).toBe(100);
        });

        test('should calculate correct percentage for mixed secure/insecure', async () => {
            const httpsAlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/https-alb/aaa111';
            const httpAlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/http-alb/bbb222';
            const tcpNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tcp-nlb/ccc333';

            const req = createMockReq({
                elb_v2: [
                    { resource_id: httpsAlbArn, Configuration: { configuration: { type: 'application' } } },
                    { resource_id: httpAlbArn, Configuration: { configuration: { type: 'application' } } },
                    { resource_id: tcpNlbArn, Configuration: { configuration: { type: 'network' } } }
                ],
                elb_v2_listeners: [
                    { Configuration: { configuration: { Protocol: 'HTTPS', LoadBalancerArn: httpsAlbArn } } },
                    { Configuration: { configuration: { Protocol: 'HTTP', LoadBalancerArn: httpAlbArn } } },
                    { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: tcpNlbArn } } }
                ],
                elb_classic: []
            });

            const result = await metric.calculate(req, year, month, day);

            // 2 ALBs counted (TCP NLB excluded), 1 secure = 50%
            expect(result).toBe(50);
        });

        test('should handle Classic ELBs correctly', async () => {
            const req = createMockReq({
                elb_v2: [],
                elb_v2_listeners: [],
                elb_classic: [
                    {
                        Configuration: {
                            configuration: {
                                listenerDescriptions: [
                                    { listener: { protocol: 'HTTPS' } }
                                ]
                            }
                        }
                    }
                ]
            });

            const result = await metric.calculate(req, year, month, day);

            expect(result).toBe(100);
        });
    });

    describe('getSummaries', () => {
        test('should return correct summary data', async () => {
            const albArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/abc123';
            const tcpNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tcp-nlb/def456';

            const req = createMockReq({
                elb_v2: [
                    { resource_id: albArn, Configuration: { configuration: { type: 'application' } } },
                    { resource_id: tcpNlbArn, Configuration: { configuration: { type: 'network' } } }
                ],
                elb_v2_listeners: [
                    { Configuration: { configuration: { Protocol: 'HTTPS', LoadBalancerArn: albArn } } },
                    { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: tcpNlbArn } } }
                ],
                elb_classic: []
            });

            const result = await metric.getSummaries(req, year, month, day);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ title: 'Total Load Balancers', value: '2' }),
                expect.objectContaining({ title: 'Application Load Balancers', value: '1' }),
                expect.objectContaining({ title: 'Network Load Balancers', value: '1' })
            ]));
        });

        test('should track TCP/UDP-only NLBs separately in summaries', async () => {
            const httpsAlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/https-alb/aaa111';
            const tcpNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tcp-nlb/bbb222';
            const tlsNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tls-nlb/ccc333';

            const req = createMockReq({
                elb_v2: [
                    { resource_id: httpsAlbArn, Configuration: { configuration: { type: 'application' } } },
                    { resource_id: tcpNlbArn, Configuration: { configuration: { type: 'network' } } },
                    { resource_id: tlsNlbArn, Configuration: { configuration: { type: 'network' } } }
                ],
                elb_v2_listeners: [
                    { Configuration: { configuration: { Protocol: 'HTTPS', LoadBalancerArn: httpsAlbArn } } },
                    { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: tcpNlbArn } } },
                    { Configuration: { configuration: { Protocol: 'TLS', LoadBalancerArn: tlsNlbArn } } }
                ],
                elb_classic: []
            });

            const result = await metric.getSummaries(req, year, month, day);

            // Total should include all LBs
            const totalLBs = result.find(s => s.title === 'Total Load Balancers');
            expect(totalLBs.value).toBe('3');

            // NLBs should show total count (both TCP and TLS)
            const nlbs = result.find(s => s.title === 'Network Load Balancers');
            expect(nlbs.value).toBe('2');
        });
    });

    describe('getKeyDetail', () => {
        test('should exclude TCP-only NLBs from deprecated TLS evaluation', async () => {
            const albArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/abc123';
            const tcpNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tcp-nlb/def456';

            const req = createMockReq({
                elb_v2: [
                    { resource_id: albArn, Configuration: { configuration: { type: 'application' } } },
                    { resource_id: tcpNlbArn, Configuration: { configuration: { type: 'network' } } }
                ],
                elb_v2_listeners: [
                    { Configuration: { configuration: { Protocol: 'HTTPS', LoadBalancerArn: albArn, SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06' } } },
                    { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: tcpNlbArn } } }
                ],
                elb_classic: []
            });

            const result = await metric.getKeyDetail(req, year, month, day);

            // Only 1 LB counted (ALB), TCP NLB excluded
            expect(result).toContain('1');
            expect(result).toContain('modern TLS');
        });

        test('should return appropriate message when no LBs exist', async () => {
            const req = createMockReq({
                elb_v2: [],
                elb_v2_listeners: [],
                elb_classic: []
            });

            const result = await metric.getKeyDetail(req, year, month, day);

            expect(result).toBe('No load balancers to evaluate');
        });

        test('should detect deprecated TLS policies', async () => {
            const albArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/abc123';

            const req = createMockReq({
                elb_v2: [
                    { resource_id: albArn, Configuration: { configuration: { type: 'application' } } }
                ],
                elb_v2_listeners: [
                    { Configuration: { configuration: { Protocol: 'HTTPS', LoadBalancerArn: albArn, SslPolicy: 'ELBSecurityPolicy-TLSv1' } } }
                ],
                elb_classic: []
            });

            const result = await metric.getKeyDetail(req, year, month, day);

            expect(result).toContain('deprecated TLS');
        });
    });
});

describe('Integration scenarios', () => {
    let metric;
    const year = 2024;
    const month = 1;
    const day = 15;

    beforeEach(() => {
        metric = new SecureLoadBalancersMetric();
    });

    test('complex scenario with all LB types', async () => {
        const httpsAlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/https-alb/aaa111';
        const httpAlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/http-alb/bbb222';
        const tcpNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tcp-nlb/ccc333';
        const tlsNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/tls-nlb/ddd444';
        const udpNlbArn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/udp-nlb/eee555';

        const req = createMockReq({
            elb_v2: [
                { resource_id: httpsAlbArn, Configuration: { configuration: { type: 'application' } } },
                { resource_id: httpAlbArn, Configuration: { configuration: { type: 'application' } } },
                { resource_id: tcpNlbArn, Configuration: { configuration: { type: 'network' } } },
                { resource_id: tlsNlbArn, Configuration: { configuration: { type: 'network' } } },
                { resource_id: udpNlbArn, Configuration: { configuration: { type: 'network' } } }
            ],
            elb_v2_listeners: [
                { Configuration: { configuration: { Protocol: 'HTTPS', LoadBalancerArn: httpsAlbArn } } },
                { Configuration: { configuration: { Protocol: 'HTTP', LoadBalancerArn: httpAlbArn } } },
                { Configuration: { configuration: { Protocol: 'TCP', LoadBalancerArn: tcpNlbArn } } },
                { Configuration: { configuration: { Protocol: 'TLS', LoadBalancerArn: tlsNlbArn } } },
                { Configuration: { configuration: { Protocol: 'UDP', LoadBalancerArn: udpNlbArn } } }
            ],
            elb_classic: [
                {
                    Configuration: {
                        configuration: {
                            listenerDescriptions: [
                                { listener: { protocol: 'HTTPS' } }
                            ]
                        }
                    }
                }
            ]
        });

        const calculateResult = await metric.calculate(req, year, month, day);

        // Total LBs for secure eval: 2 ALBs + 1 TLS NLB + 1 Classic = 4
        // (TCP NLB and UDP NLB excluded)
        // Secure: 1 HTTPS ALB + 1 TLS NLB + 1 HTTPS Classic = 3
        // Percentage: 3/4 = 75%
        expect(calculateResult).toBe(75);
    });

    test('should handle ARN matching edge cases', async () => {
        // Different account IDs but same short ID
        const nlbArn1 = 'arn:aws:elasticloadbalancing:us-east-1:111111111111:loadbalancer/net/my-nlb/sameshortid';
        const listenerLbArn = 'arn:aws:elasticloadbalancing:us-east-1:222222222222:loadbalancer/net/my-nlb/sameshortid';

        const req = createMockReq({
            elb_v2: [
                { resource_id: nlbArn1, Configuration: { configuration: { type: 'network' } } }
            ],
            elb_v2_listeners: [
                { Configuration: { configuration: { Protocol: 'TLS', LoadBalancerArn: listenerLbArn } } }
            ],
            elb_classic: []
        });

        const tcpUdpOnly = await metric._getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        // Should match by short ID even with different account IDs
        expect(tcpUdpOnly.size).toBe(0);
    });
});
