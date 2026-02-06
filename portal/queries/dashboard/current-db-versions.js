const DashboardMetric = require('./base');

class CurrentDbVersionsMetric extends DashboardMetric {
    constructor() {
        super({
            id: 'current-db-versions',
            title: 'Current DB Versions',
            description: 'RDS instances running current versions',
            category: 'modernization',
            order: 3,
            colorScheme: 'default',
            featureFlag: 'features.compliance.policies.database'
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
        
        // Return N/A if no RDS instances exist
        if (totalInstances === 0) {
            return 'N/A';
        }

        // Return 100% if all instances are current (no deprecated versions)
        const deprecatedInstances = totalInstances - currentVersionInstances;
        if (deprecatedInstances === 0) {
            return 100;
        }

        return Math.round((currentVersionInstances / totalInstances) * 100);
    }

    async getKeyDetail(req, year, month, day) {
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
        
        // Return appropriate message for special cases
        if (totalInstances === 0) {
            return 'No databases to evaluate';
        }

        const deprecatedInstances = totalInstances - currentVersionInstances;
        if (deprecatedInstances === 0) {
            return `All ${totalInstances.toLocaleString()} databases are running current versions`;
        }

        return `${deprecatedInstances.toLocaleString()} of ${totalInstances.toLocaleString()} databases with deprecated versions`;
    }
}

module.exports = CurrentDbVersionsMetric;