const DashboardMetric = require('./base');

class ModernLoadBalancersMetric extends DashboardMetric {
    constructor() {
        super({
            id: 'modern-loadbalancers',
            title: 'Modern Load Balancers',
            description: 'Using ALB/NLB instead of Classic ELB',
            category: 'modernization',
            order: 7,
            colorScheme: 'default'
        });
    }

    async calculate(req, year, month, day) {
        const elbV2Collection = req.collection("elb_v2");
        const elbClassicCollection = req.collection("elb_classic");
        
        let totalLBs = 0;
        let modernLBs = 0;
        
        // Count ELB v2 (modern)
        const elbV2Cursor = await elbV2Collection.find({
            year: year,
            month: month,
            day: day
        });
        
        for await (const doc of elbV2Cursor) {
            totalLBs++;
            modernLBs++; // All ELB v2 are considered modern
        }
        
        // Count Classic ELBs (not modern)
        const elbClassicCursor = await elbClassicCollection.find({
            year: year,
            month: month,
            day: day
        });
        
        for await (const doc of elbClassicCursor) {
            totalLBs++;
            // Don't increment modernLBs for classic ELBs
        }
        
        return totalLBs === 0 ? 0 : Math.round((modernLBs / totalLBs) * 100);
    }

    async getKeyDetail(req, year, month, day) {
        const elbV2Collection = req.collection("elb_v2");
        const elbClassicCollection = req.collection("elb_classic");
        
        let totalLBs = 0;
        let modernLBs = 0;
        
        // Count ELB v2 (modern)
        const elbV2Cursor = await elbV2Collection.find({
            year: year,
            month: month,
            day: day
        });
        
        for await (const doc of elbV2Cursor) {
            totalLBs++;
            modernLBs++; // All ELB v2 are considered modern
        }
        
        // Count Classic ELBs (not modern)
        const elbClassicCursor = await elbClassicCollection.find({
            year: year,
            month: month,
            day: day
        });
        
        for await (const doc of elbClassicCursor) {
            totalLBs++;
            // Don't increment modernLBs for classic ELBs
        }
        
        const classicLBs = totalLBs - modernLBs;
        return `${classicLBs.toLocaleString()} of ${totalLBs.toLocaleString()} load balancers using deprecated Classic ELB`;
    }
}

module.exports = ModernLoadBalancersMetric;