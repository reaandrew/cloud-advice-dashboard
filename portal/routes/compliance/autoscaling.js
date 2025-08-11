const express = require('express');
const { MongoClient } = require('mongodb');
const router = express.Router();

const mongoHost = process.env.MONGO_HOST
const mongoPort = process.env.MONGO_PORT
const uri = `mongodb://${mongoHost ?? "localhost"}:${mongoPort ?? "27017"}`;
const dbName = 'aws_data';

const { accountIdToTeam, complianceBreadcrumbs } = require('../../utils/shared');

router.get('/', (req, res) => {
    res.redirect('/compliance/autoscaling/dimensions');
});

router.get('/dimensions', async (req, res) => {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName);

        const latestDoc = await db.collection("autoscaling_groups").findOne({}, {
            projection: { year: 1, month: 1, day: 1 },
            sort: { year: -1, month: -1, day: -1 }
        });

        if (!latestDoc) {
            throw new Error("No data found in autoscaling_groups collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const asgCol = db.collection("autoscaling_groups");

        const teamDimensions = new Map();

        const ensureTeam = t => {
            if (!teamDimensions.has(t))
                teamDimensions.set(t, { dimensions: new Map() });
            return teamDimensions.get(t);
        };

        const asgCursor = asgCol.find({
            year: latestYear,
            month: latestMonth,
            day: latestDay
        }, { projection: { account_id: 1, Configuration: 1 } });

        for await (const doc of asgCursor) {
            const team = accountIdToTeam[doc.account_id] || "Unknown";
            const rec = ensureTeam(team);

            if (doc.Configuration) {
                const min = doc.Configuration.MinSize || 0;
                const max = doc.Configuration.MaxSize || 0;
                const desired = doc.Configuration.DesiredCapacity || 0;
                const key = `${min}-${max}-${desired}`;
                rec.dimensions.set(key, (rec.dimensions.get(key) || 0) + 1);
            }
        }

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
        res.status(500).send("Internal Server Error");
    } finally {
        await client.close();
    }
});

router.get('/dimensions/details', async (req, res) => {
    const client = new MongoClient(uri);
    const { team, min, max, desired, search = '', page = 1 } = req.query;
    const pageSize = 25;
    const currentPage = parseInt(page);

    try {
        await client.connect();
        const db = client.db(dbName);

        const latestDoc = await db.collection("autoscaling_groups").findOne({}, {
            projection: { year: 1, month: 1, day: 1 },
            sort: { year: -1, month: -1, day: -1 }
        });

        if (!latestDoc) {
            throw new Error("No data found in autoscaling_groups collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const allResources = [];

        const asgCursor = db.collection("autoscaling_groups").find({
            year: latestYear,
            month: latestMonth,
            day: latestDay
        }, {
            projection: { account_id: 1, resource_id: 1, Configuration: 1 }
        });

        for await (const doc of asgCursor) {
            const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
            if (docTeam !== team) continue;

            if (doc.Configuration) {
                const docMin = doc.Configuration.MinSize || 0;
                const docMax = doc.Configuration.MaxSize || 0;
                const docDesired = doc.Configuration.DesiredCapacity || 0;

                if (docMin == min && docMax == max && docDesired == desired) {
                    allResources.push({
                        resourceId: doc.resource_id,
                        shortName: doc.Configuration?.AutoScalingGroupName || doc.resource_id,
                        accountId: doc.account_id,
                        dimensions: {
                            min: docMin,
                            max: docMax,
                            desired: docDesired
                        },
                        details: {
                            launchTemplate: doc.Configuration?.LaunchTemplate?.LaunchTemplateName || doc.Configuration?.LaunchConfigurationName || "N/A",
                            instanceCount: doc.Configuration?.Instances?.length || 0,
                            healthCheckType: doc.Configuration?.HealthCheckType || "Unknown",
                            healthCheckGracePeriod: doc.Configuration?.HealthCheckGracePeriod || 0,
                            availabilityZones: doc.Configuration?.AvailabilityZones?.join(", ") || "N/A",
                            vpcZones: doc.Configuration?.VPCZoneIdentifier || "N/A",
                            targetGroups: doc.Configuration?.TargetGroupARNs?.length || 0,
                            createdTime: doc.Configuration?.CreatedTime,
                            status: doc.Configuration?.Status || "Unknown"
                        }
                    });
                }
            }
        }

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
        res.status(500).send("Internal Server Error");
    } finally {
        await client.close();
    }
});

router.get('/empty', async (req, res) => {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName);

        const latestDoc = await db.collection("autoscaling_groups").findOne({}, {
            projection: { year: 1, month: 1, day: 1 },
            sort: { year: -1, month: -1, day: -1 }
        });

        if (!latestDoc) {
            throw new Error("No data found in autoscaling_groups collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const asgCol = db.collection("autoscaling_groups");

        const teamCounts = new Map();

        const asgCursor = asgCol.find(
            {
                year: latestYear,
                month: latestMonth,
                day: latestDay,
                "Configuration.Instances": { $size: 0 }
            },
            { projection: { account_id: 1 } }
        );

        for await (const doc of asgCursor) {
            const team = accountIdToTeam[doc.account_id] || "Unknown";
            teamCounts.set(team, (teamCounts.get(team) || 0) + 1);
        }

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
        res.status(500).send("Internal Server Error");
    } finally {
        await client.close();
    }
});

module.exports = router;
