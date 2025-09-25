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

        // Return N/A if no ALBs exist
        if (totalALBs === 0) {
            return 'N/A';
        }

        // Return 100% if all ALBs are active (no inactive ALBs)
        const inactiveALBs = totalALBs - activeALBs;
        if (inactiveALBs === 0) {
            return 100;
        }

        return Math.round((activeALBs / totalALBs) * 100);
    }

    async getKeyDetail(req, year, month, day) {
        // Try to get ASG data, fall back to ALB data if ASGs don't exist
        try {
            const asgCollection = req.collection("auto_scaling_groups");
            const asgCursor = await asgCollection.find({
                year: year,
                month: month,
                day: day
            });
            
            let totalASGs = 0;
            let emptyASGs = 0;
            
            for await (const doc of asgCursor) {
                totalASGs++;
                
                const currentCapacity = doc.Configuration?.DesiredCapacity || 0;
                const instances = doc.Configuration?.Instances || [];
                
                if (currentCapacity === 0 || instances.length === 0) {
                    emptyASGs++;
                }
            }
            
            if (totalASGs > 0) {
                return `${emptyASGs.toLocaleString()} of ${totalASGs.toLocaleString()} auto scaling groups are empty`;
            }
        } catch (error) {
            // ASG collection doesn't exist, fall back to ALB data
        }
        
        // Fall back to ALB data
        const elbV2Collection = req.collection("elb_v2");
        
        const elbV2Cursor = await elbV2Collection.find({
            year: year,
            month: month,
            day: day
        });
        
        let totalALBs = 0;
        let activeALBs = 0;
        
        for await (const doc of elbV2Cursor) {
            const type = doc.Configuration?.Type;
            if (type === 'application') {
                totalALBs++;
                
                const state = doc.Configuration?.State?.Code;
                if (state === 'active' || state === 'provisioning') {
                    activeALBs++;
                }
            }
        }
        
        // Return appropriate message for special cases
        if (totalALBs === 0) {
            return 'No ALBs to evaluate';
        }

        const inactiveALBs = totalALBs - activeALBs;
        if (inactiveALBs === 0) {
            return `All ${totalALBs.toLocaleString()} ALBs are active`;
        }

        return `${inactiveALBs.toLocaleString()} of ${totalALBs.toLocaleString()} ALBs are inactive`;
    }
}

module.exports = ActiveAlbsMetric;