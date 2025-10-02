const express = require('express');
const config = require('../libs/config-loader');
const router = express.Router();

// Import dashboard queries
const { getDashboardMetrics } = require('../queries/dashboard');

// Route for the homepage
router.get('/', async (req, res) => {
    if (!config.get("features.compliance", false)) {
        // When the compliance feature is not enabled redirect to the policy documentation.
        res.redirect("/policies");
        return;
    }
    try {
        const dashboardMetrics = await getDashboardMetrics(req);

        res.render('overview.njk', {
            currentSection: 'overview',
            currentPath: '/',
            dashboardMetrics,
            enableCompliance
        });
    } catch (error) {
        console.error('Error fetching dashboard metrics:', error);
        throw error;
    }
});

module.exports = router;
