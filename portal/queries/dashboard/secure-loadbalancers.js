const DashboardMetric = require('./base');

class SecureLoadBalancersMetric extends DashboardMetric {
    constructor() {
        super({
            id: 'secure-loadbalancers',
            title: 'Secure Load Balancers',
            description: 'Load balancers with HTTPS/TLS',
            category: 'security',
            order: 2,
            colorScheme: 'success'
        });
    }

    async calculate(req, year, month, day) {
        const elbV2Collection = req.collection("elb_v2");
        const elbClassicCollection = req.collection("elb_classic");
        const listenersCollection = req.collection("elb_v2_listeners");
        
        let totalLBs = 0;
        let secureLBs = 0;
        
        // Check ELB v2 with HTTPS listeners
        const elbV2Cursor = await elbV2Collection.find({
            year: year,
            month: month,
            day: day
        });
        
        const elbV2Map = new Map();
        for await (const doc of elbV2Cursor) {
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
            const protocol = doc.Configuration?.Protocol;
            if (protocol === "HTTPS" || protocol === "TLS") {
                secureElbV2.add(doc.LoadBalancerArn);
            }
        }
        
        secureLBs += secureElbV2.size;
        
        // Check Classic ELBs with HTTPS listeners
        const elbClassicCursor = await elbClassicCollection.find({
            year: year,
            month: month,
            day: day
        });
        
        for await (const doc of elbClassicCursor) {
            totalLBs++;
            const listeners = doc.Configuration?.ListenerDescriptions || [];
            const hasSecureListener = listeners.some(listener => 
                listener.Listener?.Protocol === "HTTPS" || 
                listener.Listener?.Protocol === "SSL"
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
        let totalClassicELBs = 0;
        let secureALBs = 0;
        let secureClassicELBs = 0;
        
        // Count ELB v2 (ALB/NLB)
        const elbV2Cursor = await elbV2Collection.find({
            year: year,
            month: month,
            day: day
        });
        
        const elbV2Map = new Map();
        for await (const doc of elbV2Cursor) {
            elbV2Map.set(doc.resource_id, doc);
            if (doc.Configuration?.Type === 'application') {
                totalALBs++;
            } else if (doc.Configuration?.Type === 'network') {
                totalNLBs++;
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
            const protocol = doc.Configuration?.Protocol;
            if (protocol === "HTTPS" || protocol === "TLS") {
                secureElbV2.add(doc.LoadBalancerArn);
            }
        }
        
        // Count secure ALBs
        for (const [arn, lb] of elbV2Map) {
            if (lb.Configuration?.Type === 'application' && secureElbV2.has(arn)) {
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
            const listeners = doc.Configuration?.ListenerDescriptions || [];
            const hasSecureListener = listeners.some(listener => 
                listener.Listener?.Protocol === "HTTPS" || 
                listener.Listener?.Protocol === "SSL"
            );
            if (hasSecureListener) {
                secureClassicELBs++;
            }
        }
        
        const totalLBs = totalALBs + totalNLBs + totalClassicELBs;
        const totalSecureLBs = secureALBs + secureClassicELBs;
        
        return [
            { title: 'Total Load Balancers', value: totalLBs.toLocaleString() },
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
        
        // Check ELB v2 listeners for deprecated TLS versions (< 1.2)
        const listenersCursor = await listenersCollection.find({
            year: year,
            month: month,
            day: day
        });
        
        const deprecatedTlsArns = new Set();
        for await (const doc of listenersCursor) {
            const protocol = doc.Configuration?.Protocol;
            const sslPolicy = doc.Configuration?.SslPolicy || '';
            
            // Check for deprecated SSL policies (TLS < 1.2)
            if ((protocol === "HTTPS" || protocol === "TLS") && 
                (sslPolicy.includes('TLSv1') && !sslPolicy.includes('TLSv1.2') && !sslPolicy.includes('TLSv1.3'))) {
                deprecatedTlsArns.add(doc.LoadBalancerArn);
            }
        }
        
        // Count ELB v2
        const elbV2Cursor = await elbV2Collection.find({
            year: year,
            month: month,
            day: day
        });
        
        for await (const doc of elbV2Cursor) {
            totalLBs++;
            if (deprecatedTlsArns.has(doc.resource_id)) {
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
            const listeners = doc.Configuration?.ListenerDescriptions || [];
            const hasDeprecatedTls = listeners.some(listener => {
                const sslCertId = listener.Listener?.SSLCertificateId;
                const protocol = listener.Listener?.Protocol;
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