const express = require('express');
const router = express.Router();

const { complianceBreadcrumbs } = require('../../utils/shared');
const kmsQueries = require('../../queries/compliance/kms');

router.get('/', async (req, res) => {
    try {
        const latestDoc = await kmsQueries.getLatestKmsDate(req);

        if (!latestDoc) {
            throw new Error("No data found in kms_key_metadata collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const teamKeyAges = await kmsQueries.processKmsKeyAges(req, latestYear, latestMonth, latestDay);

        const bucketOrder = ["0-30 days", "30-90 days", "90-180 days", "180-365 days", "1-2 years", "2+ years", "Unknown"];
        const data = [...teamKeyAges.entries()].map(([team, rec]) => ({
            team,
            ageBuckets: bucketOrder
                .filter(bucket => rec.ageBuckets.has(bucket))
                .map(bucket => ({ bucket, count: rec.ageBuckets.get(bucket) }))
        })).filter(t => t.ageBuckets.length > 0);

        res.render('policies/kms/ages.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "KMS Keys", href: "/compliance/kms" }],
            policy_title: "KMS Key Ages",
            data,
            currentSection: "compliance",
            currentPath: "/compliance/kms"
        });
    } catch (err) {
        console.error(err);
        res.render('errors/no-data.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "KMS Keys", href: "/compliance/kms" }],
            policy_title: "KMS Key Ages",
            currentSection: "compliance",
            currentPath: "/compliance/kms"
        });
    }
});

// Route for KMS key details
router.get('/details', async (req, res) => {
    try {
        const { team, ageBucket, search, page = '1' } = req.query;
        const currentPage = parseInt(page) || 1;
        const pageSize = 50;

        if (!team || !ageBucket) {
            return res.status(400).send("Missing required parameters: team and ageBucket");
        }

        // Get the latest data
        const latestDoc = await kmsQueries.getLatestKmsDate(req);

        if (!latestDoc) {
            throw new Error("No data found in kms_key_metadata collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const allResources = await kmsQueries.getKmsKeyDetails(req, latestYear, latestMonth, latestDay, team, ageBucket);

        // Apply search filter
        let filteredResources = allResources;
        if (search && search.trim()) {
            const searchLower = search.toLowerCase();
            filteredResources = allResources.filter(resource =>
                resource.keyName?.toLowerCase().includes(searchLower) ||
                resource.keyId?.toLowerCase().includes(searchLower) ||
                resource.description?.toLowerCase().includes(searchLower) ||
                resource.keyUsage?.toLowerCase().includes(searchLower) ||
                resource.keyState?.toLowerCase().includes(searchLower)
            );
        }

        // Sort by creation date (newest first)
        filteredResources.sort((a, b) => new Date(b.creationDate) - new Date(a.creationDate));

        // Pagination
        const totalResults = filteredResources.length;
        const totalPages = Math.ceil(totalResults / pageSize);
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedResources = filteredResources.slice(startIndex, endIndex);

        res.render('policies/kms/details.njk', {
            breadcrumbs: [...complianceBreadcrumbs,
                { text: "KMS Keys", href: "/compliance/kms" },
                { text: `${team} - ${ageBucket}`, href: "#" }
            ],
            policy_title: `KMS Keys (${ageBucket}) - ${team} Team`,
            team,
            ageBucket,
            resources: paginatedResources,
            search: search || '',
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
            currentPath: "/compliance/kms/details"
        });
    } catch (err) {
        console.error(err);
        res.render('errors/no-data.njk', {
            breadcrumbs: [...complianceBreadcrumbs,
                { text: "KMS Keys", href: "/compliance/kms" },
                { text: "KMS Key Details", href: "#" }
            ],
            policy_title: "KMS Key Details",
            currentSection: "compliance",
            currentPath: "/compliance/kms/details"
        });
    }
});

module.exports = router;
