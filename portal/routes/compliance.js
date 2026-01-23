const express = require('express');
const router = express.Router();

// Import shared utilities
const { complianceBreadcrumbs } = require('../utils/shared');
const overviewQueries = require('../queries/compliance/overview');
const logger = require('../libs/logger');

router.get('/', async (req, res) => {
    const navigationSections = [
        {
            title: "Compliance Overview",
            items: [
                { text: "By Tenants", href: "/compliance/tenants" },
                { text: "By Teams", href: "/compliance/teams" }
            ]
        },
        {
            title: "Policies",
            items: [
                { text: "Tagging", href: "/compliance/tagging" },
                { text: "Load Balancers", href: "/compliance/loadbalancers" },
                { text: "Database", href: "/compliance/database" },
                { text: "KMS Keys", href: "/compliance/kms" },
                { text: "Auto Scaling", href: "/compliance/autoscaling" },
                { text: "Decommissioning", href: "/compliance/decommissioning" },
                { text: "Containers", href: "/compliance/containers" },
                { text: "Monitoring and Alerting", href: "/compliance/monitoring" },
                { text: "AMIs", href: "/compliance/amis" },
                { text: "Agents and Ports", href: "/compliance/agents" }
            ]
        }
    ];

    try {
        const overview = await overviewQueries.getComplianceOverview(req);

        res.render('compliance.njk', {
            breadcrumbs: complianceBreadcrumbs,
            navigationSections: navigationSections,
            overview: overview,
            currentSection: "compliance",
            currentPath: "/compliance"
        });
    } catch (err) {
        logger.error('Error loading compliance overview:', err);
        res.render('compliance.njk', {
            breadcrumbs: complianceBreadcrumbs,
            navigationSections: navigationSections,
            overview: null,
            currentSection: "compliance",
            currentPath: "/compliance"
        });
    }
});

module.exports = router;
