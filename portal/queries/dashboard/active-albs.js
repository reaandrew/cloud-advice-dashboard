const DashboardMetric = require('./base');

class ActiveAlbsMetric extends DashboardMetric {
    constructor() {
        super({
            id: 'active-albs',
            title: 'Active ALBs',
            description: 'Application Load Balancers that are active',
            category: 'performance',
            order: 5,
            colorScheme: 'default'
        });
    }

    async calculate(req, year, month, day) {
        const elbV2Collection = req.collection("elb_v2");
        
        const elbV2Cursor = await elbV2Collection.find({
            year: year,
            month: month,
            day: day
        });
        
        let totalALBs = 0;
        let activeALBs = 0;
        
        for await (const doc of elbV2Cursor) {
            // Only count Application Load Balancers
            const type = doc.Configuration?.Type;
            if (type === 'application') {
                totalALBs++;
                
                // Check if ALB is active (provisioning or active state)
                const state = doc.Configuration?.State?.Code;
                if (state === 'active' || state === 'provisioning') {
                    activeALBs++;
                }
            }
        }
        
        return totalALBs === 0 ? 0 : Math.round((activeALBs / totalALBs) * 100);
    }
}

module.exports = ActiveAlbsMetric;