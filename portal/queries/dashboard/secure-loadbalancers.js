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
        
        return totalLBs === 0 ? 0 : Math.round((secureLBs / totalLBs) * 100);
    }
}

module.exports = SecureLoadBalancersMetric;