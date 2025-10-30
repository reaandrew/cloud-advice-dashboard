const express = require('express');
const router = express.Router();

// Import shared utilities
const { complianceBreadcrumbs } = require('../../utils/shared');
const tenantQueries = require('../../queries/compliance/tenants');

// Main tenant summary route
router.get('/', async (req, res) => {
    try {
        // Get comprehensive tenant summary
        const summary = await tenantQueries.getTenantSummary(req);

        if (!summary || !summary.tenants || summary.tenants.length === 0) {
            throw new Error("No tenant data found");
        }

        res.render('policies/tenants/summary.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "By Tenant", href: "/compliance/tenants" }],
            policy_title: "Compliance Summary by Tenant",
            tenants: summary.tenants,
            currentSection: "compliance",
            currentPath: "/compliance/tenants"
        });
    } catch (err) {
        console.error('Error rendering tenant summary:', err);
        res.render('errors/no-data.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "By Tenant", href: "/compliance/tenants" }],
            policy_title: "Compliance Summary by Tenant",
            currentSection: "compliance",
            currentPath: "/compliance/tenants",
            error: err.message
        });
    }
});

module.exports = router;
