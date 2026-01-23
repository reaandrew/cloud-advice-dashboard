const fs = require('fs');
const path = require('path');

/**
 * Dashboard Registry
 * Automatically discovers and manages dashboard metrics
 */
class DashboardRegistry {
    constructor() {
        this.metrics = new Map();
        this.loadMetrics();
    }

    /**
     * Load all metric modules from the dashboard directory
     */
    loadMetrics() {
        const dashboardDir = __dirname;
        const files = fs.readdirSync(dashboardDir);
        
        files.forEach(file => {
            // Skip base.js and index.js
            if (file === 'base.js' || file === 'index.js' || !file.endsWith('.js')) {
                return;
            }
            
            try {
                const MetricClass = require(path.join(dashboardDir, file));
                const metric = new MetricClass();
                
                if (metric.enabled) {
                    this.metrics.set(metric.id, metric);
                }
            } catch (error) {
                console.error(`❌ Failed to load dashboard metric from ${file}:`, error.message);
            }
        });
    }

    /**
     * Get all enabled metrics sorted by order
     * @returns {Array} - Array of metric instances
     */
    getMetrics() {
        return Array.from(this.metrics.values())
            .filter(metric => metric.enabled)
            .sort((a, b) => a.order - b.order);
    }

    /**
     * Get metric by ID
     * @param {string} id - Metric ID
     * @returns {DashboardMetric|null} - Metric instance or null
     */
    getMetric(id) {
        return this.metrics.get(id) || null;
    }

    /**
     * Calculate all metrics for a given date
     * @param {Object} req - Express request object
     * @param {number} year - Data year
     * @param {number} month - Data month
     * @param {number} day - Data day
     * @returns {Promise<Object>} - Object with metric results
     */
    async calculateAll(req, year, month, day) {
        const results = {};
        const metrics = this.getMetrics();
        
        // Calculate all metrics in parallel
        const calculations = metrics.map(async (metric) => {
            try {
                const value = await metric.calculate(req, year, month, day);
                const keyDetail = await metric.getKeyDetail(req, year, month, day);
                
                results[metric.id] = {
                    ...metric.getMetadata(),
                    value: value,
                    formattedValue: metric.formatValue(value),
                    keyDetail: keyDetail
                };
            } catch (error) {
                console.error(`❌ Error calculating metric ${metric.id}:`, error);
                results[metric.id] = {
                    ...metric.getMetadata(),
                    value: 0,
                    formattedValue: metric.formatValue(0),
                    keyDetail: null,
                    error: error.message
                };
            }
        });
        
        await Promise.all(calculations);
        return results;
    }

    /**
     * Get all metrics summaries aggregated
     * @param {Object} req - Express request object
     * @param {number} year - Data year
     * @param {number} month - Data month
     * @param {number} day - Data day
     * @returns {Promise<Array>} - Array of all summary objects
     */
    async getAllSummaries(req, year, month, day) {
        const allSummaries = [];
        const metrics = this.getMetrics();
        
        // Collect summaries from all metrics in parallel
        const summaryCollections = metrics.map(async (metric) => {
            try {
                const summaries = await metric.getSummaries(req, year, month, day);
                return summaries.map(summary => ({
                    ...summary,
                    category: metric.category,
                    metricTitle: metric.title
                }));
            } catch (error) {
                console.error(`❌ Error getting summaries for metric ${metric.id}:`, error);
                return [];
            }
        });
        
        const results = await Promise.all(summaryCollections);
        
        // Flatten all summaries into a single array
        results.forEach(summaries => {
            allSummaries.push(...summaries);
        });
        
        return allSummaries;
    }

    /**
     * Get metrics grouped by category
     * @returns {Object} - Metrics grouped by category
     */
    getMetricsByCategory() {
        const grouped = {};
        const metrics = this.getMetrics();
        
        metrics.forEach(metric => {
            if (!grouped[metric.category]) {
                grouped[metric.category] = [];
            }
            grouped[metric.category].push(metric);
        });
        
        return grouped;
    }
}

// Create singleton instance
const dashboardRegistry = new DashboardRegistry();

/**
 * Get the latest date across all collections
 * @param {Object} req - Express request object
 * @returns {Promise<Object|null>} - Latest date object or null
 */
async function getLatestDate(req) {
    const collections = ['tags', 'elb_v2', 'rds', 'kms_keys'];
    let latestDate = null;
    
    for (const collectionName of collections) {
        try {
            const collection = req.collection(collectionName);
            const date = await collection.findOne({}, {
                projection: { year: 1, month: 1, day: 1 },
                sort: { year: -1, month: -1, day: -1 }
            });
            
            if (date && (!latestDate || 
                date.year > latestDate.year || 
                (date.year === latestDate.year && date.month > latestDate.month) ||
                (date.year === latestDate.year && date.month === latestDate.month && date.day > latestDate.day))) {
                latestDate = date;
            }
        } catch (error) {
            console.error(`Error getting latest date from ${collectionName}:`, error);
        }
    }
    
    return latestDate;
}

/**
 * Main function to get all dashboard metrics
 * @param {Object} req - Express request object
 * @returns {Promise<Object>} - Dashboard metrics result
 */
async function getDashboardMetrics(req) {
    const latestDate = await getLatestDate(req);
    
    if (!latestDate) {
        return {
            metrics: {},
            date: null,
            error: 'No data available'
        };
    }
    
    const { year, month, day } = latestDate;
    const metrics = await dashboardRegistry.calculateAll(req, year, month, day);
    
    return {
        metrics: metrics,
        date: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
        registry: dashboardRegistry
    };
}

module.exports = {
    getDashboardMetrics,
    dashboardRegistry
};