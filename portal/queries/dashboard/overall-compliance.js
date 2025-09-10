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

    async getSummaries(req, year, month, day) {
        const tagsCollection = req.collection("tags");
        
        const totalResourcesCursor = await tagsCollection.find({
            year: year,
            month: month,
            day: day
        });
        
        let totalResources = 0;
        let compliantResources = 0;
        let tagCounts = {};
        
        // Initialize tag counts
        mandatoryTags.forEach(tag => {
            tagCounts[tag] = 0;
        });
        
        for await (const doc of totalResourcesCursor) {
            totalResources++;
            
            const tags = doc.Tags || {};
            const hasAllMandatoryTags = mandatoryTags.every(tag => {
                if (tag === 'BSP') {
                    const hasBSP = tags.BillingID && (tags.Service || tags.Project);
                    if (hasBSP) tagCounts[tag]++;
                    return hasBSP;
                }
                if (tags[tag]) tagCounts[tag]++;
                return tags[tag];
            });
            
            if (hasAllMandatoryTags) {
                compliantResources++;
            }
        }
        
        const summaries = [
            { title: 'Total Resources', value: totalResources.toLocaleString() },
            { title: 'Compliant Resources', value: compliantResources.toLocaleString() },
            { title: 'Non-Compliant Resources', value: (totalResources - compliantResources).toLocaleString() }
        ];
        
        // Add individual tag compliance
        mandatoryTags.forEach(tag => {
            const percentage = totalResources === 0 ? 0 : Math.round((tagCounts[tag] / totalResources) * 100);
            summaries.push({
                title: `Resources with ${tag} tag`,
                value: `${tagCounts[tag].toLocaleString()} (${percentage}%)`
            });
        });
        
        return summaries;
    }

    async getKeyDetail(req, year, month, day) {
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
                    return tags.BillingID && (tags.Service || tags.Project);
                }
                return tags[tag];
            });
            
            if (hasAllMandatoryTags) {
                compliantResources++;
            }
        }
        
        const nonCompliantResources = totalResources - compliantResources;
        return `${nonCompliantResources.toLocaleString()} of ${totalResources.toLocaleString()} resources missing mandatory tags`;
    }
}

module.exports = OverallComplianceMetric;