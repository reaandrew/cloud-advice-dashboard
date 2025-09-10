const express = require('express');
const router = express.Router();

// Import dashboard queries
const { getDashboardMetrics } = require('../queries/dashboard');

// Route for the homepage
router.get('/', async (req, res) => {
    try {
        // Get dashboard metrics
        const dashboardMetrics = await getDashboardMetrics(req);
        
        res.render('overview.njk', {
            currentSection: 'overview',
            currentPath: '/',
            dashboardMetrics: dashboardMetrics
        });
    } catch (error) {
        console.error('Error fetching dashboard metrics:', error);
        
        res.render('overview.njk', {
            currentSection: 'overview',
            currentPath: '/',
            dashboardMetrics: null
        });
    }
});

module.exports = router;
