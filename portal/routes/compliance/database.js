const express = require('express');
const router = express.Router();

const { complianceBreadcrumbs } = require('../../utils/shared');
const dbQueries = require('../../queries/compliance/database');
const { createLogger } = require('../../libs/file-logger');

// Initialize the logger
const logger = createLogger('database-routes.log');

router.get('/', async (req, res) => {
    try {
        logger.info('Accessing database engines page');
        logger.debug('MongoDB available:', !!req.app.locals.mongodb);

        // Check if we have database access via collection method
        logger.debug('Collection method available:', typeof req.collection === 'function');

        const latestDoc = await dbQueries.getLatestRdsDate(req);
        logger.info('Latest RDS date document:', latestDoc);

        if (!latestDoc) {
            logger.warn('No RDS date document found, rendering no-data page');
            return res.render('errors/no-data.njk', {
                breadcrumbs: [...complianceBreadcrumbs, { text: "Database", href: "/compliance/database" }],
                policy_title: "Database Engines and Versions",
                currentSection: "compliance",
                currentPath: "/compliance/database"
            });
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;
        logger.info(`Using date: ${latestYear}-${latestMonth}-${latestDay} for database data`);

        const teamDatabases = await dbQueries.processDatabaseEngines(req, latestYear, latestMonth, latestDay);
        logger.info(`Team databases data:`, [...teamDatabases.keys()]);

        // Debug team database records
        for (const [team, data] of teamDatabases.entries()) {
            logger.debug(`Team ${team} engines:`, [...data.engines.entries()]);
        }

        const data = [...teamDatabases.entries()].map(([team, rec]) => ({
            team,
            engines: [...rec.engines.entries()].map(([engineVersion, count]) => {
                const [engine, ...versionParts] = engineVersion.split("-");
                return { engine, version: versionParts.join("-"), count };
            })
        })).filter(t => t.engines.length > 0);

        logger.info(`Processed data for rendering:`, data.length ? `${data.length} teams with data` : 'No teams have data');

        res.render('policies/database/engines.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "Database", href: "/compliance/database" }],
            policy_title: "Database Engines and Versions",
            data,
            currentSection: "compliance",
            currentPath: "/compliance/database"
        });
    } catch (err) {
        logger.error('Error in database engines route:', err);
        console.error('Database error:', err);
        return res.render('errors/no-data.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "Database", href: "/compliance/database" }],
            policy_title: "Database Engines and Versions",
            currentSection: "compliance",
            currentPath: "/compliance/database",
            // Include debug info in the error page
            debug_info: {
                error: err.message,
                stack: err.stack,
                mongodb_available: !!req.app.locals.mongodb,
                collection_method_available: typeof req.collection === 'function'
            }
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
        console.error(err);
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
