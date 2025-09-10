/**
 * Base Dashboard Metric Class
 * Provides a standardized structure for dashboard metrics
 */
class DashboardMetric {
    constructor(config) {
        this.id = config.id;
        this.title = config.title;
        this.description = config.description;
        this.category = config.category || 'general';
        this.order = config.order || 0;
        this.colorScheme = config.colorScheme || 'default'; // default, success, warning, error
        this.enabled = config.enabled !== false; // Default to enabled unless explicitly disabled
    }

    /**
     * Calculate the metric value
     * Must be implemented by subclasses
     * @param {Object} req - Express request object with database access
     * @param {number} year - Data year
     * @param {number} month - Data month  
     * @param {number} day - Data day
     * @returns {Promise<number>} - Percentage value (0-100)
     */
    async calculate(req, year, month, day) {
        throw new Error(`calculate() method must be implemented by ${this.constructor.name}`);
    }

    /**
     * Get metric metadata for display
     * @returns {Object} - Metric metadata
     */
    getMetadata() {
        return {
            id: this.id,
            title: this.title,
            description: this.description,
            category: this.category,
            order: this.order,
            colorScheme: this.colorScheme,
            enabled: this.enabled
        };
    }

    /**
     * Format the calculated value for display
     * @param {number} value - The calculated value
     * @returns {string} - Formatted display value
     */
    formatValue(value) {
        return `${value}%`;
    }

    /**
     * Get key metric detail for this component
     * @param {Object} req - Express request object with database access
     * @param {number} year - Data year
     * @param {number} month - Data month  
     * @param {number} day - Data day
     * @returns {Promise<string|null>} - Key detail string or null
     */
    async getKeyDetail(req, year, month, day) {
        // Default implementation returns null
        // Subclasses can override to provide specific detail
        return null;
    }
}

module.exports = DashboardMetric;