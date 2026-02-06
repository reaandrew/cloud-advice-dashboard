const express = require('express');
const router = express.Router();

// Import shared utilities
const { complianceBreadcrumbs } = require('../utils/shared');
const overviewQueries = require('../queries/compliance/overview');
const config = require('../libs/config-loader');

const overviewEntries = [
    { text: "By Tenants", href: "/compliance/tenants", flag: "features.compliance.overview.tenants" },
    { text: "By Teams", href: "/compliance/teams", flag: "features.compliance.overview.teams" },
    { text: "Load Balancers", href: "/compliance/loadbalancers", flag: "features.compliance.overview.loadbalancers" },
];

const policyEntries = [
    { text: "Tagging", href: "/compliance/tagging", flag: "features.compliance.policies.tagging" },
    { text: "Load Balancers", href: "/compliance/loadbalancers", flag: "features.compliance.policies.loadbalancers" },
    { text: "Database", href: "/compliance/database", flag: "features.compliance.policies.database" },
    { text: "KMS Keys", href: "/compliance/kms", flag: "features.compliance.policies.kms" },
    { text: "Auto Scaling", href: "/compliance/autoscaling", flag: "features.compliance.policies.autoscaling" },
    { text: "Decommissioning", href: "/compliance/decommissioning", flag: "features.compliance.policies.decommissioning" },
    { text: "Containers", href: "/compliance/containers", flag: "features.compliance.policies.containers" },
    { text: "Monitoring and Alerting", href: "/compliance/monitoring", flag: "features.compliance.policies.monitoring" },
    { text: "AMIs", href: "/compliance/amis", flag: "features.compliance.policies.amis" },
    { text: "Agents and Ports", href: "/compliance/agents", flag: "features.compliance.policies.agents" },
];

router.get('/', async (req, res) => {
    const overviewItems = overviewEntries.filter(e => config.get(e.flag, false));
    const policyItems = policyEntries.filter(e => config.get(e.flag, false));

    const navigationSections = [];
    if (overviewItems.length > 0) {
        navigationSections.push({ title: "Compliance Overview", items: overviewItems });
    }
    if (policyItems.length > 0) {
        navigationSections.push({ title: "Policies", items: policyItems });
    }

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
