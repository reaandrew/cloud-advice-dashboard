const express = require('express');
const router = express.Router();

// Import shared utilities
const { complianceBreadcrumbs, mandatoryTags } = require('../../utils/shared');
const taggingQueries = require('../../queries/compliance/tagging');

// Main tagging route redirects to teams
router.get('/', (_, res) => {
    res.redirect('/compliance/tagging/teams');
});

router.get('/teams', async (req, res) => {
    try {
        // Get the latest date from tags collection
        const latestDoc = await taggingQueries.getLatestTagsDate(req);

        if (!latestDoc) {
            throw new Error("No data found in tags collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        // Check tags collection for latest date only
        const cursor = await taggingQueries.getTagsForDate(req, latestYear, latestMonth, latestDay);

        const teamAgg = await taggingQueries.processTeamsTagCompliance(req, cursor);

        // Format data for view
        const data = [...teamAgg.entries()].map(([team, rec]) => ({
            team,
            resourceTypes: [...rec.resourceTypes.entries()].map(([resourceType, tagMissing]) => ({
                resourceType,
                tags: mandatoryTags.map(tag => ({
                    tagName: tag,
                    missingCount: tagMissing.get(tag),
                    hasMissing: tagMissing.get(tag) > 0
                }))
            }))
        })).filter(t => t.resourceTypes.length > 0);

        // Sort teams by total missing tags (descending)
        data.sort((a, b) => {
            const totalA = a.resourceTypes.reduce((sum, rt) => sum + rt.tags.reduce((tagSum, tag) => tagSum + tag.missingCount, 0), 0);
            const totalB = b.resourceTypes.reduce((sum, rt) => sum + rt.tags.reduce((tagSum, tag) => tagSum + tag.missingCount, 0), 0);
            return totalB - totalA;
        });

        res.render('policies/tagging/teams.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "Tagging", href: "/compliance/tagging" }],
            policy_title: "Tagging Compliance by Team",
            menu_items: [
                { href: "/compliance/tagging/teams", text: "Teams Overview" },
                { href: "/compliance/tagging/services", text: "Services Overview" }
            ],
            data,
            mandatoryTags,
            currentSection: "compliance",
            currentPath: "/compliance/tagging/teams"
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
});

router.get('/details', async (req, res) => {
    const { team, resourceType, tag, search = '', page = 1 } = req.query;
    const pageSize = 25;
    const currentPage = parseInt(page);

    try {
        // Get the latest date from tags collection
        const latestDoc = await taggingQueries.getLatestTagsDate(req);

        if (!latestDoc) {
            throw new Error("No data found in tags collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const cursor = await taggingQueries.getTagsForDateWithProjection(req, latestYear, latestMonth, latestDay);

        const allResources = await taggingQueries.processTagDetailsForTeam(req, cursor, team, resourceType, tag);

        // Apply search filter
        const filteredResources = search ?
            allResources.filter(r =>
                r.resourceId.toLowerCase().includes(search.toLowerCase()) ||
                r.shortName.toLowerCase().includes(search.toLowerCase()) ||
                r.accountId.includes(search)
            ) : allResources;

        // Sort by short name
        filteredResources.sort((a, b) => a.shortName.localeCompare(b.shortName));

        // Pagination
        const totalResults = filteredResources.length;
        const totalPages = Math.ceil(totalResults / pageSize);
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedResources = filteredResources.slice(startIndex, endIndex);

        res.render('policies/tagging/details.njk', {
            breadcrumbs: [...complianceBreadcrumbs,
            { text: "Tagging", href: "/compliance/tagging" },
            { text: "Teams", href: "/compliance/tagging/teams" },
            { text: `${team} - ${resourceType} - ${tag}`, href: "#" }
            ],
            policy_title: `Missing ${tag} Tags - ${team} Team`,
            team,
            resourceType,
            tag,
            resources: paginatedResources,
            search,
            pagination: {
                currentPage,
                totalPages,
                totalResults,
                pageSize,
                hasNext: currentPage < totalPages,
                hasPrev: currentPage > 1,
                startResult: startIndex + 1,
                endResult: Math.min(endIndex, totalResults)
            },
            currentSection: "compliance",
            currentPath: "/compliance/tagging/details"
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
});

router.get('/services', (_, res) => {
    res.render('policies/tagging/services.njk', {
        breadcrumbs: [...complianceBreadcrumbs, { text: "Tagging", href: "/compliance/tagging" }],
        policy_title: "Tagging",
        menu_items: [
            { href: "/compliance/tagging/teams", text: "Teams Overview" },
            { href: "/compliance/tagging/services", text: "Services Overview" }
        ],
        currentSection: "compliance",
        currentPath: "/compliance/tagging/services"
    });
});

module.exports = router;
