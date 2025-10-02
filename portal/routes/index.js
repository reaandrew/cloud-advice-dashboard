const express = require('express');
const config = require('../libs/config-loader');
const router = express.Router();

// Import dashboard queries
const { getDashboardMetrics } = require('../queries/dashboard');
const { requiresAuth } = require('express-openid-connect');

// Route for the homepage
router.get('/', async (req, res) => {
    if (!config.get("features.compliance", false)) {
        // When the compliance feature is not enabled redirect to the policy documentation.
        res.redirect("/policies");
        return;
    }
    try {
        const authenticated = (config.get("features.auth") && !!req.oidc.user) || !config.get("features.auth")
        const dashboardMetrics = authenticated ? await getDashboardMetrics(req) : null;

        res.render('overview.njk', {
            authenticated,
            currentSection: 'overview',
            currentPath: '/',
            dashboardMetrics,
        });
    } catch (error) {
        console.error('Error fetching dashboard metrics:', error);
        throw error;
    }
});

module.exports = router;
