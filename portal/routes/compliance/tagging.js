const express = require('express');
const { MongoClient } = require('mongodb');
const router = express.Router();

const mongoHost = process.env.MONGO_HOST
const mongoPort = process.env.MONGO_PORT
const uri = `mongodb://${mongoHost ?? "localhost"}:${mongoPort ?? "27017"}`;
const dbName = 'aws_data';

// Import shared utilities
const { accountIdToTeam, complianceBreadcrumbs, mandatoryTags } = require('../../utils/shared');

// Main tagging route redirects to teams
router.get('/', (_, res) => {
    res.redirect('/compliance/tagging/teams');
});

router.get('/teams', async (_, res) => {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);

        // Get the latest date from tags collection
        const latestDoc = await db.collection("tags").findOne({}, {
            projection: { year: 1, month: 1, day: 1 },
            sort: { year: -1, month: -1, day: -1 }
        });

        if (!latestDoc) {
            throw new Error("No data found in tags collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        // Check tags collection for latest date only
        const cursor = db.collection("tags").find({
            year: latestYear,
            month: latestMonth,
            day: latestDay
        }, {
            projection: { day: 1, account_id: 1, resource_id: 1, resource_type: 1, Tags: 1 }
        });

        const teamAgg = new Map();
        const ensureTeam = t => {
            if (!teamAgg.has(t)) {
                teamAgg.set(t, { resourceTypes: new Map(), _seen: new Set() });
            }
            return teamAgg.get(t);
        };

        const ensureResourceType = (teamRec, resourceType) => {
            if (!teamRec.resourceTypes.has(resourceType)) {
                const tagMissing = new Map();
                mandatoryTags.forEach(tag => tagMissing.set(tag, 0));
                teamRec.resourceTypes.set(resourceType, tagMissing);
            }
            return teamRec.resourceTypes.get(resourceType);
        };

        const isMissing = v =>
            v === null || v === undefined || (typeof v === "string" && v.trim() === "");

        const bucketStartsWithAccountId = arn => /^\d{12}/.test((arn.split(":::")[1] || ""));

        for await (const doc of cursor) {
            if (doc.resource_type === "bucket" && bucketStartsWithAccountId(doc.resource_id)) continue;

            const team = accountIdToTeam[doc.account_id] || "Unknown";
            const rec = ensureTeam(team);

            const resourceType = doc.resource_type || "Unknown";
            const tagMissing = ensureResourceType(rec, resourceType);

            const uniqueKey = `${doc.account_id}-${doc.resource_id}`;
            if (rec._seen.has(uniqueKey)) continue;
            rec._seen.add(uniqueKey);

            const tags = {};
            if (doc.Tags && Array.isArray(doc.Tags)) {
                for (const tag of doc.Tags) {
                    if (tag.Key && tag.Value !== undefined) {
                        tags[tag.Key.toLowerCase()] = tag.Value;
                    }
                }
            }

            for (const originalTagName of mandatoryTags) {
                const tagName = originalTagName.toLowerCase();
                if (originalTagName === "BSP") {
                    const hasBillingID = !isMissing(tags["billingid"]);
                    const hasService = !isMissing(tags["service"]);
                    const hasProject = !isMissing(tags["project"]);
                    const bspValid = hasBillingID && (hasService || hasProject);
                    if (!bspValid) {
                        tagMissing.set(originalTagName, tagMissing.get(originalTagName) + 1);
                    }
                } else {
                    if (isMissing(tags[tagName])) {
                        tagMissing.set(originalTagName, tagMissing.get(originalTagName) + 1);
                    }
                }
            }
        }

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
    } finally {
        await client.close();
    }
});

router.get('/details', async (req, res) => {
    const client = new MongoClient(uri);
    const { team, resourceType, tag, search = '', page = 1 } = req.query;
    const pageSize = 25;
    const currentPage = parseInt(page);

    try {
        await client.connect();
        const db = client.db(dbName);

        // Get the latest date from tags collection
        const latestDoc = await db.collection("tags").findOne({}, {
            projection: { year: 1, month: 1, day: 1 },
            sort: { year: -1, month: -1, day: -1 }
        });

        if (!latestDoc) {
            throw new Error("No data found in tags collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const cursor = db.collection("tags").find({
            year: latestYear,
            month: latestMonth,
            day: latestDay
        }, {
            projection: { account_id: 1, resource_id: 1, resource_type: 1, Tags: 1 }
        });

        const allResources = [];
        const isMissing = v => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
        const bucketStartsWithAccountId = arn => /^\d{12}/.test((arn.split(":::")[1] || ""));

        for await (const doc of cursor) {
            if (doc.resource_type === "bucket" && bucketStartsWithAccountId(doc.resource_id)) continue;

            const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
            if (docTeam !== team || doc.resource_type !== resourceType) continue;

            const tags = {};
            if (doc.Tags && Array.isArray(doc.Tags)) {
                for (const tagItem of doc.Tags) {
                    if (tagItem.Key && tagItem.Value !== undefined) {
                        tags[tagItem.Key.toLowerCase()] = tagItem.Value;
                    }
                }
            }

            let shouldInclude = false;
            if (tag === "BSP") {
                const hasBillingID = !isMissing(tags["billingid"]);
                const hasService = !isMissing(tags["service"]);
                const hasProject = !isMissing(tags["project"]);
                const bspValid = hasBillingID && (hasService || hasProject);
                shouldInclude = !bspValid;
            } else {
                shouldInclude = isMissing(tags[tag.toLowerCase()]);
            }

            if (shouldInclude) {
                const shortName = doc.resource_id.split('/').pop() || doc.resource_id.split(':').pop() || doc.resource_id;
                allResources.push({
                    resourceId: doc.resource_id,
                    shortName: shortName,
                    accountId: doc.account_id,
                    tags: Object.entries(tags).map(([key, value]) => [key, value])
                });
            }
        }

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
    } finally {
        await client.close();
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
