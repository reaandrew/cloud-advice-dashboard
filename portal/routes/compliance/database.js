const express = require('express');
const router = express.Router();

const { complianceBreadcrumbs } = require('../../utils/shared');
const dbQueries = require('../../queries/compliance/database');
const logger = require('../../libs/logger');

router.get('/', async (req, res) => {
    try {
        const latestDoc = await dbQueries.getLatestRdsDate(req);

        if (!latestDoc) {
            return res.render('errors/no-data.njk', {
                breadcrumbs: [...complianceBreadcrumbs, { text: "Database", href: "/compliance/database" }],
                policy_title: "Database Engines and Versions",
                currentSection: "compliance",
                currentPath: "/compliance/database"
            });
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const teamDatabases = await dbQueries.processDatabaseEngines(req, latestYear, latestMonth, latestDay);

        const data = [...teamDatabases.entries()].map(([team, rec]) => ({
            team,
            engines: [...rec.engines.entries()].map(([engineVersion, count]) => {
                const [engine, ...versionParts] = engineVersion.split("-");
                return { engine, version: versionParts.join("-"), count };
            })
        })).filter(t => t.engines.length > 0);

        res.render('policies/database/engines.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "Database", href: "/compliance/database" }],
            policy_title: "Database Engines and Versions",
            data,
            currentSection: "compliance",
            currentPath: "/compliance/database"
        });
    } catch (err) {
        logger.error('Error in database engines route:', err);
        return res.render('errors/no-data.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "Database", href: "/compliance/database" }],
            policy_title: "Database Engines and Versions",
            currentSection: "compliance",
            currentPath: "/compliance/database"
        });
    }
});

router.get('/details', async (req, res) => {
    const { team, engine, version, search = '', page = 1 } = req.query;
    const pageSize = 25;
    const currentPage = parseInt(page);

    try {
        const latestDoc = await dbQueries.getLatestRdsDate(req);

        if (!latestDoc) {
            return res.render('errors/no-data.njk', {
                breadcrumbs: [...complianceBreadcrumbs,
                    { text: "Database", href: "/compliance/database" },
                    { text: `${team} - ${engine} ${version}`, href: "#" }
                ],
                policy_title: `${engine} ${version} Instances - ${team} Team`,
                currentSection: "compliance",
                currentPath: "/compliance/database/details"
            });
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const allResources = await dbQueries.getDatabaseDetails(req, latestYear, latestMonth, latestDay, team, engine, version);

        const filteredResources = search ?
            allResources.filter(r =>
                r.resourceId.toLowerCase().includes(search.toLowerCase()) ||
                r.shortName.toLowerCase().includes(search.toLowerCase()) ||
                r.accountId.includes(search)
            ) : allResources;

        filteredResources.sort((a, b) => a.shortName.localeCompare(b.shortName));

        const totalResults = filteredResources.length;
        const totalPages = Math.ceil(totalResults / pageSize);
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedResources = filteredResources.slice(startIndex, endIndex);

        res.render('policies/database/details.njk', {
            breadcrumbs: [...complianceBreadcrumbs,
            { text: "Database", href: "/compliance/database" },
            { text: `${team} - ${engine} ${version}`, href: "#" }
            ],
            policy_title: `${engine} ${version} Instances - ${team} Team`,
            team,
            engine,
            version,
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
            currentPath: "/compliance/database/details"
        });
    } catch (err) {
        logger.error('Error in database details route:', err);
        return res.render('errors/no-data.njk', {
            breadcrumbs: [...complianceBreadcrumbs,
                { text: "Database", href: "/compliance/database" },
                { text: "Database Details", href: "#" }
            ],
            policy_title: "Database Details",
            currentSection: "compliance",
            currentPath: "/compliance/database/details"
        });
    }
});

module.exports = router;
