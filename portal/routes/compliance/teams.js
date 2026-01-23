const express = require('express');
const router = express.Router();

// Import shared utilities
const { complianceBreadcrumbs } = require('../../utils/shared');
const teamQueries = require('../../queries/compliance/teams');

// Main team summary route
router.get('/', async (req, res) => {
    try {
        // Get comprehensive team summary
        const summary = await teamQueries.getTeamSummary(req);

        if (!summary || !summary.teams || summary.teams.length === 0) {
            throw new Error("No team data found");
        }

        res.render('policies/teams/summary.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "By Teams", href: "/compliance/teams" }],
            policy_title: "Compliance Summary by Team",
            teams: summary.teams,
            currentSection: "compliance",
            currentPath: "/compliance/teams"
        });
    } catch (err) {
        res.render('errors/no-data.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "By Teams", href: "/compliance/teams" }],
            policy_title: "Compliance Summary by Team",
            currentSection: "compliance",
            currentPath: "/compliance/teams",
            error: err.message
        });
    }
});

module.exports = router;
