const DashboardMetric = require('./base');

class CurrentDbVersionsMetric extends DashboardMetric {
    constructor() {
        super({
            id: 'current-db-versions',
            title: 'Current DB Versions',
            description: 'RDS instances running current versions',
            category: 'modernization',
            order: 3,
            colorScheme: 'default'
        });
    }

    async calculate(req, year, month, day) {
        const rdsCollection = req.collection("rds");
        
        const rdsCursor = await rdsCollection.find({
            year: year,
            month: month,
            day: day
        });
        
        let totalInstances = 0;
        let currentVersionInstances = 0;
        
        // Define what we consider "current" versions
        const currentVersions = {
            'mysql': ['8.0.35', '8.0.34', '8.0.33'],
            'postgres': ['16.1', '15.5', '14.10'],
            'aurora-mysql': ['8.0.mysql_aurora.3.04.0', '8.0.mysql_aurora.3.03.0'],
            'aurora-postgresql': ['15.5', '14.10', '13.13']
        };
        
        for await (const doc of rdsCursor) {
            totalInstances++;
            
            const engine = doc.Configuration?.Engine?.toLowerCase() || '';
            const version = doc.Configuration?.EngineVersion || '';
            
            // Check if this engine/version combination is considered current
            let isCurrent = false;
            for (const [engineType, versions] of Object.entries(currentVersions)) {
                if (engine.includes(engineType) && versions.some(v => version.startsWith(v))) {
                    isCurrent = true;
                    break;
                }
            }
            
            if (isCurrent) {
                currentVersionInstances++;
            }
        }
        
        return totalInstances === 0 ? 0 : Math.round((currentVersionInstances / totalInstances) * 100);
    }
}

module.exports = CurrentDbVersionsMetric;