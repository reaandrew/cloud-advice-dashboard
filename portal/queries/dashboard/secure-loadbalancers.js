const DashboardMetric = require('./base');

class SecureLoadBalancersMetric extends DashboardMetric {
    constructor() {
        super({
            id: 'secure-loadbalancers',
            title: 'Secure Load Balancers',
            description: 'Load balancers with HTTPS/TLS',
            category: 'security',
            order: 2,
            colorScheme: 'success',
            featureFlag: 'features.compliance.policies.loadbalancers'
        });
    }

    /**
     * Get NLBs that have ONLY TCP/UDP/TCP_UDP listeners (no TLS listeners).
     * These should be excluded from TLS certificate evaluation since they operate at layer 4.
     * @returns {Set} Set of NLB resource_ids to exclude from TLS evaluation
     */
    async _getNlbsWithOnlyTcpUdpListeners(req, year, month, day) {
        const elbV2Collection = req.collection("elb_v2");
        const listenersCollection = req.collection("elb_v2_listeners");

        const nlbResourceIds = new Set();
        const nlbsWithTlsListeners = new Set();

        // Get all NLBs (type="network")
        const elbV2Cursor = await elbV2Collection.find({
            year: year,
            month: month,
            day: day
        });

        for await (const doc of elbV2Cursor) {
            const type = doc.Configuration?.configuration?.type;
            if (type === "network") {
                nlbResourceIds.add(doc.resource_id);
            }
        }

        // Check which NLBs have TLS listeners
        const listenersCursor = await listenersCollection.find({
            year: year,
            month: month,
            day: day
        });

        for await (const doc of listenersCursor) {
            const protocol = doc.Configuration?.configuration?.Protocol;
            const loadBalancerArn = doc.Configuration?.configuration?.LoadBalancerArn;

            if (loadBalancerArn && protocol === "TLS") {
                nlbsWithTlsListeners.add(loadBalancerArn);
                // Also check by short ID for cross-account ARN matching
                const shortId = loadBalancerArn.split('/').pop();
                for (const nlbId of nlbResourceIds) {
                    if (nlbId.split('/').pop() === shortId) {
                        nlbsWithTlsListeners.add(nlbId);
                    }
                }
            }
        }

        // Return NLBs that have NO TLS listeners (only TCP/UDP)
        const tcpUdpOnlyNlbs = new Set();
        for (const nlbId of nlbResourceIds) {
            if (!nlbsWithTlsListeners.has(nlbId)) {
                tcpUdpOnlyNlbs.add(nlbId);
            }
        }

        return tcpUdpOnlyNlbs;
    }

    async calculate(req, year, month, day) {
        const elbV2Collection = req.collection("elb_v2");
        const elbClassicCollection = req.collection("elb_classic");
        const listenersCollection = req.collection("elb_v2_listeners");

        let totalLBs = 0;
        let secureLBs = 0;

        // Get NLBs with only TCP/UDP listeners to exclude from evaluation
        const tcpUdpOnlyNlbs = await this._getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        // Check ELB v2 with HTTPS/TLS listeners (excluding TCP/UDP-only NLBs)
        const elbV2Cursor = await elbV2Collection.find({
            year: year,
            month: month,
            day: day
        });

        const elbV2Map = new Map();
        for await (const doc of elbV2Cursor) {
            // Skip NLBs with only TCP/UDP listeners
            if (tcpUdpOnlyNlbs.has(doc.resource_id)) continue;
            totalLBs++;
            elbV2Map.set(doc.resource_id, doc);
        }

        // Check listeners for HTTPS/TLS protocols
        const listenersCursor = await listenersCollection.find({
            year: year,
            month: month,
            day: day
        });

        const secureElbV2 = new Set();
        for await (const doc of listenersCursor) {
            const protocol = doc.Configuration?.configuration?.Protocol;
            const loadBalancerArn = doc.Configuration?.configuration?.LoadBalancerArn;
            if (protocol === "HTTPS" || protocol === "TLS") {
                if (loadBalancerArn) {
                    secureElbV2.add(loadBalancerArn);
                    // Also match by short ID
                    const shortId = loadBalancerArn.split('/').pop();
                    for (const [resourceId] of elbV2Map) {
                        if (resourceId.split('/').pop() === shortId) {
                            secureElbV2.add(resourceId);
                        }
                    }
                }
            }
        }

        // Count secure ELB v2s that are in our tracked map
        for (const [resourceId] of elbV2Map) {
            if (secureElbV2.has(resourceId)) {
                secureLBs++;
            }
        }

        // Check Classic ELBs with HTTPS listeners
        const elbClassicCursor = await elbClassicCollection.find({
            year: year,
            month: month,
            day: day
        });

        for await (const doc of elbClassicCursor) {
            totalLBs++;
            const listeners = doc.Configuration?.configuration?.listenerDescriptions || [];
            const hasSecureListener = listeners.some(listener =>
                listener.listener?.protocol === "HTTPS" ||
                listener.listener?.protocol === "SSL"
            );
            if (hasSecureListener) {
                secureLBs++;
            }
        }

        // Return N/A if no load balancers exist
        if (totalLBs === 0) {
            return 'N/A';
        }

        // Return 100% if all load balancers are secure (no insecure LBs)
        const insecureLBs = totalLBs - secureLBs;
        if (insecureLBs === 0) {
            return 100;
        }

        return Math.round((secureLBs / totalLBs) * 100);
    }

    async getSummaries(req, year, month, day) {
        const elbV2Collection = req.collection("elb_v2");
        const elbClassicCollection = req.collection("elb_classic");
        const listenersCollection = req.collection("elb_v2_listeners");

        let totalALBs = 0;
        let totalNLBs = 0;
        let totalTcpUdpOnlyNLBs = 0;
        let totalClassicELBs = 0;
        let secureALBs = 0;
        let secureClassicELBs = 0;

        // Get NLBs with only TCP/UDP listeners to exclude from secure evaluation
        const tcpUdpOnlyNlbs = await this._getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        // Count ELB v2 (ALB/NLB)
        const elbV2Cursor = await elbV2Collection.find({
            year: year,
            month: month,
            day: day
        });

        const elbV2Map = new Map();
        for await (const doc of elbV2Cursor) {
            const type = doc.Configuration?.configuration?.type;
            if (type === 'application') {
                totalALBs++;
                elbV2Map.set(doc.resource_id, doc);
            } else if (type === 'network') {
                totalNLBs++;
                // Track TCP/UDP-only NLBs separately - they're excluded from secure evaluation
                if (tcpUdpOnlyNlbs.has(doc.resource_id)) {
                    totalTcpUdpOnlyNLBs++;
                } else {
                    elbV2Map.set(doc.resource_id, doc);
                }
            }
        }

        // Check listeners for HTTPS/TLS protocols
        const listenersCursor = await listenersCollection.find({
            year: year,
            month: month,
            day: day
        });

        const secureElbV2 = new Set();
        for await (const doc of listenersCursor) {
            const protocol = doc.Configuration?.configuration?.Protocol;
            const loadBalancerArn = doc.Configuration?.configuration?.LoadBalancerArn;
            if (protocol === "HTTPS" || protocol === "TLS") {
                if (loadBalancerArn) {
                    secureElbV2.add(loadBalancerArn);
                    // Also match by short ID
                    const shortId = loadBalancerArn.split('/').pop();
                    for (const [resourceId] of elbV2Map) {
                        if (resourceId.split('/').pop() === shortId) {
                            secureElbV2.add(resourceId);
                        }
                    }
                }
            }
        }

        // Count secure ALBs (NLBs with TLS are also counted via secureElbV2)
        for (const [resourceId, lb] of elbV2Map) {
            const type = lb.Configuration?.configuration?.type;
            if (type === 'application' && secureElbV2.has(resourceId)) {
                secureALBs++;
            }
        }

        // Count Classic ELBs
        const elbClassicCursor = await elbClassicCollection.find({
            year: year,
            month: month,
            day: day
        });

        for await (const doc of elbClassicCursor) {
            totalClassicELBs++;
            const listeners = doc.Configuration?.configuration?.listenerDescriptions || [];
            const hasSecureListener = listeners.some(listener =>
                listener.listener?.protocol === "HTTPS" ||
                listener.listener?.protocol === "SSL"
            );
            if (hasSecureListener) {
                secureClassicELBs++;
            }
        }

        // Calculate totals (NLBs with only TCP/UDP are NOT counted in secure evaluation)
        const totalLBsForSecureEval = totalALBs + (totalNLBs - totalTcpUdpOnlyNLBs) + totalClassicELBs;
        const totalSecureLBs = secureALBs + secureClassicELBs;

        return [
            { title: 'Total Load Balancers', value: (totalALBs + totalNLBs + totalClassicELBs).toLocaleString() },
            { title: 'Secure Load Balancers', value: totalSecureLBs.toLocaleString() },
            { title: 'Application Load Balancers', value: totalALBs.toLocaleString() },
            { title: 'Secure ALBs', value: `${secureALBs.toLocaleString()} of ${totalALBs.toLocaleString()}` },
            { title: 'Network Load Balancers', value: totalNLBs.toLocaleString() },
            { title: 'Classic ELBs', value: totalClassicELBs.toLocaleString() },
            { title: 'Secure Classic ELBs', value: `${secureClassicELBs.toLocaleString()} of ${totalClassicELBs.toLocaleString()}` }
        ];
    }

    async getKeyDetail(req, year, month, day) {
        const elbV2Collection = req.collection("elb_v2");
        const elbClassicCollection = req.collection("elb_classic");
        const listenersCollection = req.collection("elb_v2_listeners");

        let totalLBs = 0;
        let deprecatedTlsLBs = 0;

        // Get NLBs with only TCP/UDP listeners to exclude from evaluation
        const tcpUdpOnlyNlbs = await this._getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        // Check ELB v2 listeners for deprecated TLS versions (< 1.2)
        const listenersCursor = await listenersCollection.find({
            year: year,
            month: month,
            day: day
        });

        const deprecatedTlsArns = new Set();
        for await (const doc of listenersCursor) {
            const protocol = doc.Configuration?.configuration?.Protocol;
            const sslPolicy = doc.Configuration?.configuration?.SslPolicy || '';
            const loadBalancerArn = doc.Configuration?.configuration?.LoadBalancerArn;

            // Check for deprecated SSL policies (TLS < 1.2)
            if ((protocol === "HTTPS" || protocol === "TLS") &&
                (sslPolicy.includes('TLSv1') && !sslPolicy.includes('TLSv1.2') && !sslPolicy.includes('TLSv1.3'))) {
                if (loadBalancerArn) {
                    deprecatedTlsArns.add(loadBalancerArn);
                }
            }
        }

        // Count ELB v2 (excluding TCP/UDP-only NLBs)
        const elbV2Cursor = await elbV2Collection.find({
            year: year,
            month: month,
            day: day
        });

        for await (const doc of elbV2Cursor) {
            // Skip NLBs with only TCP/UDP listeners
            if (tcpUdpOnlyNlbs.has(doc.resource_id)) continue;

            totalLBs++;
            // Check both exact match and short ID match for deprecated TLS
            const shortId = doc.resource_id.split('/').pop();
            const hasDeprecated = deprecatedTlsArns.has(doc.resource_id) ||
                [...deprecatedTlsArns].some(arn => arn.split('/').pop() === shortId);
            if (hasDeprecated) {
                deprecatedTlsLBs++;
            }
        }

        // Count Classic ELBs with deprecated TLS
        const elbClassicCursor = await elbClassicCollection.find({
            year: year,
            month: month,
            day: day
        });

        for await (const doc of elbClassicCursor) {
            totalLBs++;
            const listeners = doc.Configuration?.configuration?.listenerDescriptions || [];
            const hasDeprecatedTls = listeners.some(listener => {
                const sslCertId = listener.listener?.sSLCertificateId;
                const protocol = listener.listener?.protocol;
                // Classic ELBs using SSL/HTTPS are assumed to have deprecated TLS if no modern policy specified
                return (protocol === "HTTPS" || protocol === "SSL") && sslCertId;
            });

            if (hasDeprecatedTls) {
                deprecatedTlsLBs++;
            }
        }

        // Return appropriate message for special cases
        if (totalLBs === 0) {
            return 'No load balancers to evaluate';
        }

        if (deprecatedTlsLBs === 0) {
            return `All ${totalLBs.toLocaleString()} load balancers use modern TLS`;
        }

        return `${deprecatedTlsLBs.toLocaleString()} of ${totalLBs.toLocaleString()} load balancers with deprecated TLS`;
    }
}

module.exports = SecureLoadBalancersMetric;