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

module.exports = router;
