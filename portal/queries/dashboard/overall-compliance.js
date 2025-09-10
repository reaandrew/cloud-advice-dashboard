const DashboardMetric = require('./base');
const { mandatoryTags } = require('../../utils/shared');

class OverallComplianceMetric extends DashboardMetric {
    constructor() {
        super({
            id: 'overall-compliance',
            title: 'Overall Compliance',
            description: 'Resources with all mandatory tags',
            category: 'compliance',
            order: 1,
            colorScheme: 'default'
        });
    }

    async calculate(req, year, month, day) {
        const tagsCollection = req.collection("tags");
        
        const totalResourcesCursor = await tagsCollection.find({
            year: year,
            month: month,
            day: day
        });
        
        let totalResources = 0;
        let compliantResources = 0;
        
        for await (const doc of totalResourcesCursor) {
            totalResources++;
            
            const tags = doc.Tags || {};
            const hasAllMandatoryTags = mandatoryTags.every(tag => {
                if (tag === 'BSP') {
                    // BSP requires BillingID and (Service OR Project)
                    return tags.BillingID && (tags.Service || tags.Project);
                }
                return tags[tag];
            });
            
            if (hasAllMandatoryTags) {
                compliantResources++;
            }
        }
        
        return totalResources === 0 ? 0 : Math.round((compliantResources / totalResources) * 100);
    }
}

module.exports = OverallComplianceMetric;