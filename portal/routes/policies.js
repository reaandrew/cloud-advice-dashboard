const express = require('express');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const router = express.Router();

// Import shared utilities
const { policiesBreadcrumbs, markdownRoot } = require('../utils/shared');

// Function to get proper display name for policy breadcrumbs
function getPolicyDisplayName(policy) {
    const policyMap = {
        'tagging': 'Tagging',
        'databases': 'Databases', 
        'load_balancers': 'Load Balancers',
        'decommissioning': 'Decommissioning'
    };
    return policyMap[policy] || policy.charAt(0).toUpperCase() + policy.slice(1);
}

// Route for /policies to show policy documentation landing page
router.get('/', (_, res) => {
    const navigationSections = [
        {
            title: "Policy Documents",
            items: [
                { text: "Tagging", href: "/policies/tagging" },
                { text: "Databases", href: "/policies/databases" },
                { text: "Load Balancers", href: "/policies/load_balancers" },
                { text: "Decommissioning", href: "/policies/decommissioning" }
            ]
        }
    ];

    const landingContent = `
        <h1 class="govuk-heading-l">AWS Policies</h1>
        <p class="govuk-body-l">This section contains policy documentation and compliance reports for AWS resources.</p>

        <h2 class="govuk-heading-m">Policy Documents</h2>
        <p class="govuk-body">Policy documents describe the standards and best practices for managing AWS resources.</p>
        <ul class="govuk-list govuk-list--bullet">
            <li><a class="govuk-link" href="/policies/tagging">Tagging</a> - Resource tagging standards and requirements</li>
            <li><a class="govuk-link" href="/policies/databases">Databases</a> - Database configuration and security policies</li>
            <li><a class="govuk-link" href="/policies/load_balancers">Load Balancers</a> - Load balancer security and configuration standards</li>
            <li><a class="govuk-link" href="/policies/decommissioning">Decommissioning</a> - Guidelines for safely decommissioning resources</li>
        </ul>

        <h2 class="govuk-heading-m">Compliance Reports</h2>
        <p class="govuk-body">Compliance reports show the current compliance status of AWS resources against our policies.</p>
        <ul class="govuk-list govuk-list--bullet">
            <li><a class="govuk-link" href="/compliance/tagging">Tagging Compliance</a> - Resource tagging compliance by team</li>
            <li><a class="govuk-link" href="/compliance/loadbalancers">Load Balancers</a> - TLS configurations and load balancer types</li>
            <li><a class="govuk-link" href="/compliance/database">Database Engines</a> - Database versions and deprecation status</li>
            <li><a class="govuk-link" href="/compliance/kms">KMS Keys</a> - KMS key age and rotation status</li>
            <li><a class="govuk-link" href="/compliance/autoscaling">Auto Scaling</a> - ASG configurations and empty groups</li>
        </ul>
    `;

    res.render('policy.njk', {
        breadcrumbs: policiesBreadcrumbs,
        policyContent: landingContent,
        navigationSections: navigationSections,
        currentSection: "policies",
        currentPath: "/policies"
    });
});

// Markdown rendering route for policies
router.get('/:policy', (req, res) => {
    const policy = req.params.policy;
    const filePath = path.join(markdownRoot, `${policy}.md`);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            // Try to provide a helpful error message
            const navigationSections = [
                {
                    title: "Policy Documents",
                    items: [
                        { text: "Tagging", href: "/policies/tagging" },
                        { text: "Databases", href: "/policies/databases" },
                        { text: "Load Balancers", href: "/policies/load_balancers" },
                        { text: "Decommissioning", href: "/policies/decommissioning" }
                    ]
                }
            ];

            const errorContent = `
                <h1 class="govuk-heading-l">Policy document not found</h1>
                <p class="govuk-body">The policy document <code>${policy}.md</code> was not found in the markdown directory.</p>
                <p class="govuk-body">To create this policy document, add a file named <code>${policy}.md</code> to the <code>${markdownRoot}</code> directory.</p>
                <div class="govuk-warning-text">
                    <span class="govuk-warning-text__icon" aria-hidden="true">!</span>
                    <strong class="govuk-warning-text__text">
                        <span class="govuk-warning-text__assistive">Warning</span>
                        If you were looking for a compliance report instead of a policy document, check the Compliance Reports section in the navigation.
                    </strong>
                </div>
            `;

            return res.status(404).render('policy.njk', {
                breadcrumbs: [...policiesBreadcrumbs, { text: getPolicyDisplayName(policy), href: `/policies/${policy}` }],
                policyContent: errorContent,
                navigationSections: navigationSections,
                currentSection: "policies",
                currentPath: `/policies/${policy}`
            });
        }

        const htmlContent = marked(data);
        const navigationSections = [
            {
                title: "Policy Documents",
                items: [
                    { text: "Tagging", href: "/policies/tagging" },
                    { text: "Databases", href: "/policies/databases" },
                    { text: "Load Balancers", href: "/policies/load_balancers" },
                    { text: "Decommissioning", href: "/policies/decommissioning" }
                ]
            }
        ];

        res.render('policy.njk', {
            breadcrumbs: [...policiesBreadcrumbs, { text: getPolicyDisplayName(policy), href: `/policies/${policy}` }],
            policyContent: htmlContent,
            navigationSections: navigationSections,
            currentSection: "policies",
            currentPath: `/policies/${policy}`
        });
    });
});

module.exports = router;
