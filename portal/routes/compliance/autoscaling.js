const express = require('express');
const router = express.Router();

const { complianceBreadcrumbs } = require('../../utils/shared');
const asgQueries = require('../../queries/compliance/autoscaling');

router.get('/', (req, res) => {
    res.redirect('/compliance/autoscaling/dimensions');
});

router.get('/dimensions', async (req, res) => {
    try {
        // Add diagnostic logging to check MongoDB document structure directly
        console.log('--- Route Debug - Direct MongoDB Query ---');

        // Direct query to get one ASG document for structure analysis
        const sampleDoc = await req.collection("autoscaling_groups").findOne({}, { projection: { Configuration: 1 } });

        if (sampleDoc) {
            console.log('Sample document structure test:');
            console.log('Configuration exists:', !!sampleDoc?.Configuration);
            console.log('Configuration.configuration exists:', !!sampleDoc?.Configuration?.configuration);

            // Check which path contains the MinSize field
            console.log('Direct MinSize exists:', sampleDoc?.Configuration?.MinSize !== undefined);
            console.log('Nested MinSize exists:', sampleDoc?.Configuration?.configuration?.MinSize !== undefined);

            // Log structure paths without revealing values
            console.log('Configuration keys:', Object.keys(sampleDoc?.Configuration || {}));
            if (sampleDoc?.Configuration?.configuration) {
                console.log('Configuration.configuration keys:', Object.keys(sampleDoc.Configuration.configuration));
            }
        } else {
            console.log('No autoscaling_groups documents found');
        }

        const latestDoc = await asgQueries.getLatestAutoscalingDate(req);

        if (!latestDoc) {
            throw new Error("No data found in autoscaling_groups collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const teamDimensions = await asgQueries.processAutoscalingDimensions(req, latestYear, latestMonth, latestDay);

        const data = [...teamDimensions.entries()].map(([team, rec]) => ({
            team,
            dimensions: [...rec.dimensions.entries()].map(([dimensionKey, count]) => {
                const [min, max, desired] = dimensionKey.split("-");
                return { min: parseInt(min), max: parseInt(max), desired: parseInt(desired), count };
            }).sort((a, b) => b.count - a.count)
        })).filter(t => t.dimensions.length > 0);

        res.render('policies/autoscaling/dimensions.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "Auto Scaling", href: "/compliance/autoscaling" }],
            policy_title: "Auto Scaling Group Dimensions",
            menu_items: [
                { href: "/compliance/autoscaling/dimensions", text: "ASG Dimensions" },
                { href: "/compliance/autoscaling/empty", text: "Empty ASGs" }
            ],
            data,
            currentSection: "compliance",
            currentPath: "/compliance/autoscaling/dimensions"
        });
    } catch (err) {
        console.error(err);
        res.render('errors/no-data.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "Auto Scaling", href: "/compliance/autoscaling" }],
            policy_title: "Auto Scaling Group Dimensions",
            currentSection: "compliance",
            currentPath: "/compliance/autoscaling/dimensions"
        });
    }
});

router.get('/dimensions/details', async (req, res) => {
    const { team, min, max, desired, search = '', page = 1 } = req.query;
    const pageSize = 25;
    const currentPage = parseInt(page);

    try {
        const latestDoc = await asgQueries.getLatestAutoscalingDate(req);

        if (!latestDoc) {
            throw new Error("No data found in autoscaling_groups collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const allResources = await asgQueries.getAutoscalingDimensionDetails(req, {
            year: latestYear,
            month: latestMonth,
            day: latestDay,
            team,
            min,
            max,
            desired
        });

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

        res.render('policies/autoscaling/dimensions/details.njk', {
            breadcrumbs: [...complianceBreadcrumbs,
            { text: "Auto Scaling", href: "/compliance/autoscaling" },
            { text: "Dimensions", href: "/compliance/autoscaling/dimensions" },
            { text: `${team} - ${min}/${max}/${desired}`, href: "#" }
            ],
            policy_title: `Auto Scaling Groups (${min}/${max}/${desired}) - ${team} Team`,
            team,
            min,
            max,
            desired,
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
            currentPath: "/compliance/autoscaling/dimensions/details"
        });
    } catch (err) {
        console.error(err);
        res.render('errors/no-data.njk', {
            breadcrumbs: [...complianceBreadcrumbs,
                { text: "Auto Scaling", href: "/compliance/autoscaling" },
                { text: "Dimensions", href: "/compliance/autoscaling/dimensions" },
                { text: `${team || 'Details'} - ${min || 'N/A'}/${max || 'N/A'}/${desired || 'N/A'}`, href: "#" }
            ],
            policy_title: `Auto Scaling Groups${team ? ` (${min}/${max}/${desired}) - ${team} Team` : ' - Details'}`,
            currentSection: "compliance",
            currentPath: "/compliance/autoscaling/dimensions/details"
        });
    }
});

router.get('/empty', async (req, res) => {
    try {
        const latestDoc = await asgQueries.getLatestAutoscalingDate(req);

        if (!latestDoc) {
            throw new Error("No data found in autoscaling_groups collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const teamCounts = await asgQueries.countEmptyAutoscalingGroups(req, latestYear, latestMonth, latestDay);

        const data = [...teamCounts.entries()]
            .map(([team, count]) => ({ team, count }))
            .sort((a, b) => b.count - a.count);

        res.render('policies/autoscaling/empty.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "Auto Scaling", href: "/compliance/autoscaling" }],
            policy_title: "Auto Scaling Groups with No Instances",
            menu_items: [
                { href: "/compliance/autoscaling/dimensions", text: "ASG Dimensions" },
                { href: "/compliance/autoscaling/empty", text: "Empty ASGs" }
            ],
            data,
            currentSection: "compliance",
            currentPath: "/compliance/autoscaling/empty"
        });
    } catch (err) {
        console.error(err);
        res.render('errors/no-data.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "Auto Scaling", href: "/compliance/autoscaling" }],
            policy_title: "Auto Scaling Groups with No Instances",
            currentSection: "compliance",
            currentPath: "/compliance/autoscaling/empty"
        });
    }
});

module.exports = router;
