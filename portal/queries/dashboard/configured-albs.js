const DashboardMetric = require('./base');

class ConfiguredAlbsMetric extends DashboardMetric {
    constructor() {
        super({
            id: 'configured-albs',
            title: 'Correctly Configured ALBs',
            description: 'ALBs with proper health checks and targets',
            category: 'performance',
            order: 6,
            colorScheme: 'default'
        });
    }

    async calculate(req, year, month, day) {
        const elbV2Collection = req.collection("elb_v2");
        const targetGroupsCollection = req.collection("elb_v2_target_groups");
        
        const elbV2Cursor = await elbV2Collection.find({
            year: year,
            month: month,
            day: day
        });
        
        let totalALBs = 0;
        let correctlyConfiguredALBs = 0;
        
        // Get all target groups for this date
        const targetGroupsCursor = await targetGroupsCollection.find({
            year: year,
            month: month,
            day: day
        });
        
        const targetGroupsMap = new Map();
        for await (const tg of targetGroupsCursor) {
            const lbArns = tg.Configuration?.LoadBalancerArns || [];
            lbArns.forEach(arn => {
                if (!targetGroupsMap.has(arn)) {
                    targetGroupsMap.set(arn, []);
                }
                targetGroupsMap.get(arn).push(tg);
            });
        }
        
        for await (const doc of elbV2Cursor) {
            const type = doc.Configuration?.Type;
            if (type === 'application') {
                totalALBs++;
                
                const albArn = doc.resource_id;
                const targetGroups = targetGroupsMap.get(albArn) || [];
                
                // Check if ALB is correctly configured:
                // 1. Has at least one target group
                // 2. Target groups have proper health check configuration
                let isCorrectlyConfigured = false;
                
                if (targetGroups.length > 0) {
                    isCorrectlyConfigured = targetGroups.some(tg => {
                        const healthCheck = tg.Configuration?.HealthCheckEnabled;
                        const healthCheckPath = tg.Configuration?.HealthCheckPath;
                        const healthCheckProtocol = tg.Configuration?.HealthCheckProtocol;
                        
                        return healthCheck !== false && 
                               healthCheckPath && 
                               healthCheckProtocol && 
                               (healthCheckProtocol === 'HTTP' || healthCheckProtocol === 'HTTPS');
                    });
                }
                
                if (isCorrectlyConfigured) {
                    correctlyConfiguredALBs++;
                }
            }
        }
        
        // Return N/A if no ALBs exist
        if (totalALBs === 0) {
            return 'N/A';
        }

        // Return 100% if all ALBs are correctly configured (no misconfigured ALBs)
        const misconfiguredALBs = totalALBs - correctlyConfiguredALBs;
        if (misconfiguredALBs === 0) {
            return 100;
        }

        return Math.round((correctlyConfiguredALBs / totalALBs) * 100);
    }

    async getKeyDetail(req, year, month, day) {
        const elbV2Collection = req.collection("elb_v2");
        const targetGroupsCollection = req.collection("elb_v2_target_groups");
        
        const elbV2Cursor = await elbV2Collection.find({
            year: year,
            month: month,
            day: day
        });
        
        let totalALBs = 0;
        let correctlyConfiguredALBs = 0;
        
        // Get all target groups for this date
        const targetGroupsCursor = await targetGroupsCollection.find({
            year: year,
            month: month,
            day: day
        });
        
        const targetGroupsMap = new Map();
        for await (const tg of targetGroupsCursor) {
            const lbArns = tg.Configuration?.LoadBalancerArns || [];
            lbArns.forEach(arn => {
                if (!targetGroupsMap.has(arn)) {
                    targetGroupsMap.set(arn, []);
                }
                targetGroupsMap.get(arn).push(tg);
            });
        }
        
        for await (const doc of elbV2Cursor) {
            const type = doc.Configuration?.Type;
            if (type === 'application') {
                totalALBs++;
                
                const albArn = doc.resource_id;
                const targetGroups = targetGroupsMap.get(albArn) || [];
                
                if (targetGroups.length > 0) {
                    const isCorrectlyConfigured = targetGroups.some(tg => {
                        const healthCheck = tg.Configuration?.HealthCheckEnabled;
                        const healthCheckPath = tg.Configuration?.HealthCheckPath;
                        const healthCheckProtocol = tg.Configuration?.HealthCheckProtocol;
                        
                        return healthCheck !== false && 
                               healthCheckPath && 
                               healthCheckProtocol && 
                               (healthCheckProtocol === 'HTTP' || healthCheckProtocol === 'HTTPS');
                    });
                    
                    if (isCorrectlyConfigured) {
                        correctlyConfiguredALBs++;
                    }
                }
            }
        }
        
        // Return appropriate message for special cases
        if (totalALBs === 0) {
            return 'No ALBs to evaluate';
        }

        const misconfiguredALBs = totalALBs - correctlyConfiguredALBs;
        if (misconfiguredALBs === 0) {
            return `All ${totalALBs.toLocaleString()} ALBs are correctly configured`;
        }

        return `${misconfiguredALBs.toLocaleString()} of ${totalALBs.toLocaleString()} ALBs misconfigured`;
    }
}

module.exports = ConfiguredAlbsMetric;