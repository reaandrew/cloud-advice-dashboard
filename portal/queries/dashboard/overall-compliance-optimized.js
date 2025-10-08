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

        // OPTIMIZATION 1: Use aggregation pipeline for better performance
        const pipeline = [
            // Match documents for specific date
            { $match: { year: year, month: month, day: day } },

            // Project only needed fields to reduce memory usage
            { $project: { Tags: 1 } },

            // Add compliance check
            {
                $addFields: {
                    isCompliant: {
                        $and: [
                            // Check each mandatory tag
                            ...mandatoryTags.map(tag => {
                                if (tag === 'BSP') {
                                    return {
                                        $and: [
                                            { $ne: ['$Tags.BillingID', null] },
                                            {
                                                $or: [
                                                    { $ne: ['$Tags.Service', null] },
                                                    { $ne: ['$Tags.Project', null] }
                                                ]
                                            }
                                        ]
                                    };
                                }
                                return { $ne: [`$Tags.${tag}`, null] };
                            })
                        ]
                    }
                }
            },

            // Group and count
            {
                $group: {
                    _id: null,
                    totalResources: { $sum: 1 },
                    compliantResources: {
                        $sum: { $cond: [{ $eq: ['$isCompliant', true] }, 1, 0] }
                    }
                }
            }
        ];

        // Use allowDiskUse for large datasets
        const results = await tagsCollection.aggregate(pipeline, {
            allowDiskUse: true,
            maxTimeMS: 30000  // 30 second timeout
        }).toArray();

        if (results.length === 0 || results[0].totalResources === 0) {
            return 'N/A';
        }

        const { totalResources, compliantResources } = results[0];
        const nonCompliantResources = totalResources - compliantResources;

        if (nonCompliantResources === 0) {
            return 100;
        }

        return Math.round((compliantResources / totalResources) * 100);
    }

    // Alternative: If aggregation is not possible, use cursor with batch processing
    async calculateWithCursor(req, year, month, day) {
        const tagsCollection = req.collection("tags");

        // OPTIMIZATION: Add hint to force index usage
        const totalResourcesCursor = tagsCollection.find({
            year: year,
            month: month,
            day: day
        }, {
            projection: { Tags: 1 }  // Only fetch Tags field
        }).hint({ year: 1, month: 1, day: 1 });  // Force index usage

        let totalResources = 0;
        let compliantResources = 0;

        // Process in batches to avoid memory issues
        const batchSize = 1000;
        let batch = [];

        for await (const doc of totalResourcesCursor) {
            batch.push(doc);

            if (batch.length >= batchSize) {
                const result = this.processBatch(batch);
                totalResources += result.total;
                compliantResources += result.compliant;
                batch = [];
            }
        }

        // Process remaining documents
        if (batch.length > 0) {
            const result = this.processBatch(batch);
            totalResources += result.total;
            compliantResources += result.compliant;
        }

        if (totalResources === 0) {
            return 'N/A';
        }

        const nonCompliantResources = totalResources - compliantResources;
        if (nonCompliantResources === 0) {
            return 100;
        }

        return Math.round((compliantResources / totalResources) * 100);
    }

    processBatch(batch) {
        let total = batch.length;
        let compliant = 0;

        for (const doc of batch) {
            const tags = doc.Tags || {};
            const hasAllMandatoryTags = mandatoryTags.every(tag => {
                if (tag === 'BSP') {
                    return tags.BillingID && (tags.Service || tags.Project);
                }
                return tags[tag];
            });

            if (hasAllMandatoryTags) {
                compliant++;
            }
        }

        return { total, compliant };
    }

    async getSummaries(req, year, month, day) {
        const tagsCollection = req.collection("tags");

        // Use aggregation for summary statistics
        const pipeline = [
            { $match: { year: year, month: month, day: day } },
            { $project: { Tags: 1 } },
            {
                $facet: {
                    totalCount: [{ $count: 'count' }],
                    tagCounts: [
                        {
                            $group: {
                                _id: null,
                                ...Object.fromEntries(
                                    mandatoryTags.map(tag => {
                                        if (tag === 'BSP') {
                                            return [tag, {
                                                $sum: {
                                                    $cond: [
                                                        {
                                                            $and: [
                                                                { $ne: ['$Tags.BillingID', null] },
                                                                {
                                                                    $or: [
                                                                        { $ne: ['$Tags.Service', null] },
                                                                        { $ne: ['$Tags.Project', null] }
                                                                    ]
                                                                }
                                                            ]
                                                        },
                                                        1,
                                                        0
                                                    ]
                                                }
                                            }];
                                        }
                                        return [tag, {
                                            $sum: { $cond: [{ $ne: [`$Tags.${tag}`, null] }, 1, 0] }
                                        }];
                                    })
                                )
                            }
                        }
                    ]
                }
            }
        ];

        const results = await tagsCollection.aggregate(pipeline, {
            allowDiskUse: true,
            maxTimeMS: 30000
        }).toArray();

        const totalResources = results[0]?.totalCount[0]?.count || 0;
        const tagCounts = results[0]?.tagCounts[0] || {};

        // Calculate compliant resources
        let compliantResources = 0;
        if (totalResources > 0 && tagCounts._id !== null) {
            // This is an approximation - for exact count, need different aggregation
            const minTagCount = Math.min(...mandatoryTags.map(tag => tagCounts[tag] || 0));
            compliantResources = minTagCount;
        }

        const summaries = [
            { title: 'Total Resources', value: totalResources.toLocaleString() },
            { title: 'Compliant Resources', value: compliantResources.toLocaleString() },
            { title: 'Non-Compliant Resources', value: (totalResources - compliantResources).toLocaleString() }
        ];

        mandatoryTags.forEach(tag => {
            const count = tagCounts[tag] || 0;
            const percentage = totalResources === 0 ? 0 : Math.round((count / totalResources) * 100);
            summaries.push({
                title: `Resources with ${tag} tag`,
                value: `${count.toLocaleString()} (${percentage}%)`
            });
        });

        return summaries;
    }

    async getKeyDetail(req, year, month, day) {
        // Use the main calculate method's result for consistency
        const percentage = await this.calculate(req, year, month, day);

        if (percentage === 'N/A') {
            return 'No resources to evaluate';
        }

        // Get counts from aggregation
        const tagsCollection = req.collection("tags");
        const countResult = await tagsCollection.countDocuments({
            year: year,
            month: month,
            day: day
        });

        if (percentage === 100) {
            return `All ${countResult.toLocaleString()} resources have mandatory tags`;
        }

        const compliantCount = Math.round((percentage / 100) * countResult);
        const nonCompliantCount = countResult - compliantCount;

        return `${nonCompliantCount.toLocaleString()} of ${countResult.toLocaleString()} resources missing mandatory tags`;
    }
}

module.exports = OverallComplianceMetric;