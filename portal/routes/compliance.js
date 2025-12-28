const express = require('express');
const router = express.Router();

// Import shared utilities
const { complianceBreadcrumbs } = require('../utils/shared');
const overviewQueries = require('../queries/compliance/overview');

// New rules pattern imports
const registerComplianceRule = require('../libs/middleware/registerComplianceRule');
const registerComplianceView = require('../libs/middleware/registerComplianceView');
const { autoscalingGroupDimensionsRule, autoscalingGroupsView } = require('../queries/compliance/autoscaling');
const { kmsKeysRule, kmsKeysView } = require('../queries/compliance/kms');
const { missingTagsRule, taggingView } = require('../queries/compliance/tagging');
const { databasesView, databaseVersionsRule } = require('../queries/compliance/database');
const { loadBalancersView, loadBalancerComplianceRule } = require('../queries/compliance/loadbalancers');

const views = [
    autoscalingGroupsView,
    kmsKeysView,
    taggingView,
    databasesView,
    loadBalancersView,
];

const rules = [
    autoscalingGroupDimensionsRule,
    kmsKeysRule,
    missingTagsRule,
    databaseVersionsRule,
    loadBalancerComplianceRule,
];

views.forEach(view => registerComplianceView(view, router));
rules.forEach(rule => registerComplianceRule(rule, router));

router.get('/', async (req, res) => {
    const navigationSections = [
        {
            title: "Compliance Overview",
            items: [
                // TODO: Update these By links to align on the main page instead with a similar drop down method.
                // TODO: Update how our rules work to also return a metric for compliance. This can then be used in our dashboard.
                // TODO: Update how we render to be able to render all rules .
                // TODO: Figure out a standard column name for compliance violations.
                // IDEA: Extra layer of abstraction. View: Generic has all data. Summary (what we now call rule): Summary of compliance. New rule: A code that is outputted in the compliance column. This can then be filtered in the overview screen.
                { text: "By Tenants", href: "/compliance/tenants" },
                { text: "By Teams", href: "/compliance/teams" }
            ]
        },
        {
            title: "Compliance Rules",
            items: rules.map(rule => ({ text: rule.name, href: `/compliance/rule/${rule.id}` })),
        },
        {
            title: "Data Views",
            items: views.map(view => ({ text: view.name, href: `/compliance/view/${view.id}` })),
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
        console.error('Error loading compliance overview:', err);
        res.render('compliance.njk', {
            breadcrumbs: complianceBreadcrumbs,
            navigationSections: navigationSections,
            overview: null,
            currentSection: "compliance",
            currentPath: "/compliance"
        });
    }
});

module.exports = { router, views };
