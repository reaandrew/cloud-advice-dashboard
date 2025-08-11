const express = require('express');
const { MongoClient } = require('mongodb');
const router = express.Router();

const mongoHost = process.env.MONGO_HOST
const mongoPort = process.env.MONGO_PORT
const uri = `mongodb://${mongoHost ?? "localhost"}:${mongoPort ?? "27017"}`;
const dbName = 'aws_data';

const { accountIdToTeam, complianceBreadcrumbs } = require('../../utils/shared');

router.get('/', async (_, res) => {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName);

        const latestDoc = await db.collection("kms_key_metadata").findOne({}, {
            projection: { year: 1, month: 1, day: 1 },
            sort: { year: -1, month: -1, day: -1 }
        });

        if (!latestDoc) {
            throw new Error("No data found in kms_key_metadata collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const kmsCol = db.collection("kms_key_metadata");

        const teamKeyAges = new Map();

        const ensureTeam = t => {
            if (!teamKeyAges.has(t))
                teamKeyAges.set(t, { ageBuckets: new Map() });
            return teamKeyAges.get(t);
        };

        const getAgeBucket = (creationDate) => {
            if (!creationDate) return "Unknown";
            const ageInDays = (Date.now() - new Date(creationDate).getTime()) / (1000 * 60 * 60 * 24);
            if (ageInDays < 30) return "0-30 days";
            if (ageInDays < 90) return "30-90 days";
            if (ageInDays < 180) return "90-180 days";
            if (ageInDays < 365) return "180-365 days";
            if (ageInDays < 730) return "1-2 years";
            return "2+ years";
        };

        const kmsCursor = kmsCol.find({
            year: latestYear,
            month: latestMonth,
            day: latestDay
        }, { projection: { account_id: 1, Configuration: 1 } });

        for await (const doc of kmsCursor) {
            const team = accountIdToTeam[doc.account_id] || "Unknown";
            const rec = ensureTeam(team);

            if (doc.Configuration?.CreationDate) {
                const bucket = getAgeBucket(doc.Configuration.CreationDate);
                rec.ageBuckets.set(bucket, (rec.ageBuckets.get(bucket) || 0) + 1);
            }
        }

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
        res.status(500).send("Internal Server Error");
    } finally {
        await client.close();
    }
});

// Route for KMS key details
router.get('/details', async (req, res) => {
    const client = new MongoClient(uri);
    try {
        const { team, ageBucket, search, page = '1' } = req.query;
        const currentPage = parseInt(page) || 1;
        const pageSize = 50;

        if (!team || !ageBucket) {
            return res.status(400).send("Missing required parameters: team and ageBucket");
        }

        await client.connect();
        const db = client.db(dbName);

        // Get the latest data
        const latestDoc = await db.collection("kms_key_metadata").findOne({}, {
            projection: { year: 1, month: 1, day: 1 },
            sort: { year: -1, month: -1, day: -1 }
        });

        if (!latestDoc) {
            throw new Error("No data found in kms_key_metadata collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const getAgeBucket = (creationDate) => {
            if (!creationDate) return "Unknown";
            const ageInDays = (Date.now() - new Date(creationDate).getTime()) / (1000 * 60 * 60 * 24);
            if (ageInDays < 30) return "0-30 days";
            if (ageInDays < 90) return "30-90 days";
            if (ageInDays < 180) return "90-180 days";
            if (ageInDays < 365) return "180-365 days";
            if (ageInDays < 730) return "1-2 years";
            return "2+ years";
        };

        const getAgeDescription = (creationDate) => {
            if (!creationDate) return "Unknown";
            const ageInDays = Math.floor((Date.now() - new Date(creationDate).getTime()) / (1000 * 60 * 60 * 24));
            if (ageInDays === 0) return "Today";
            if (ageInDays === 1) return "1 day";
            if (ageInDays < 30) return `${ageInDays} days`;
            if (ageInDays < 365) return `${Math.floor(ageInDays / 30)} months`;
            return `${Math.floor(ageInDays / 365)} years`;
        };

        // Build the query
        const query = {
            year: latestYear,
            month: latestMonth,
            day: latestDay
        };

        // Find matching account IDs for the team
        const teamAccountIds = Object.entries(accountIdToTeam)
            .filter(([_, teamName]) => teamName === team)
            .map(([accountId, _]) => accountId);

        if (teamAccountIds.length === 0) {
            throw new Error(`No account IDs found for team: ${team}`);
        }

        query.account_id = { $in: teamAccountIds };

        const kmsCol = db.collection("kms_key_metadata");
        const cursor = kmsCol.find(query, { 
            projection: { 
                account_id: 1, 
                resource_id: 1,
                Configuration: 1,
                Tags: 1
            } 
        });

        const allResources = [];
        for await (const doc of cursor) {
            if (!doc.Configuration?.CreationDate) continue;
            
            const resourceAgeBucket = getAgeBucket(doc.Configuration.CreationDate);
            if (resourceAgeBucket !== ageBucket) continue;

            const resource = {
                resourceId: doc.resource_id,
                keyId: doc.Configuration.KeyId || doc.resource_id,
                keyName: doc.Configuration.Description || '',
                creationDate: doc.Configuration.CreationDate ? new Date(doc.Configuration.CreationDate).toLocaleDateString() : 'Unknown',
                ageDescription: getAgeDescription(doc.Configuration.CreationDate),
                keyUsage: doc.Configuration.KeyUsage,
                keyState: doc.Configuration.KeyState,
                keySpec: doc.Configuration.KeySpec,
                origin: doc.Configuration.Origin,
                description: doc.Configuration.Description,
                arn: doc.Configuration.Arn || doc.resource_id
            };

            allResources.push(resource);
        }

        // Apply search filter
        let filteredResources = allResources;
        if (search && search.trim()) {
            const searchLower = search.toLowerCase();
            filteredResources = allResources.filter(resource => 
                (resource.keyName && resource.keyName.toLowerCase().includes(searchLower)) ||
                (resource.keyId && resource.keyId.toLowerCase().includes(searchLower)) ||
                (resource.description && resource.description.toLowerCase().includes(searchLower)) ||
                (resource.keyUsage && resource.keyUsage.toLowerCase().includes(searchLower)) ||
                (resource.keyState && resource.keyState.toLowerCase().includes(searchLower))
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
        res.status(500).send("Internal Server Error");
    } finally {
        await client.close();
    }
});

module.exports = router;
