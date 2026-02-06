const DashboardMetric = require('./base');

class ModernLoadBalancersMetric extends DashboardMetric {
    constructor() {
        super({
            id: 'modern-loadbalancers',
            title: 'Modern Load Balancers',
            description: 'Using ALB/NLB instead of Classic ELB',
            category: 'modernization',
            order: 7,
            colorScheme: 'default',
            featureFlag: 'features.compliance.policies.loadbalancers'
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
        
        // Return N/A if no load balancers exist
        if (totalLBs === 0) {
            return 'N/A';
        }

        // Return 100% if all load balancers are modern (no classic ELBs)
        const classicLBs = totalLBs - modernLBs;
        if (classicLBs === 0) {
            return 100;
        }

        return Math.round((modernLBs / totalLBs) * 100);
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
        
        // Return appropriate message for special cases
        if (totalLBs === 0) {
            return 'No load balancers to evaluate';
        }

        const classicLBs = totalLBs - modernLBs;
        if (classicLBs === 0) {
            return `All ${totalLBs.toLocaleString()} load balancers are modern (ALB/NLB)`;
        }

        return `${classicLBs.toLocaleString()} of ${totalLBs.toLocaleString()} load balancers using deprecated Classic ELB`;
    }
}

module.exports = ModernLoadBalancersMetric;