const express = require('express');
const { MongoClient } = require('mongodb');
const router = express.Router();

const mongoHost = process.env.MONGO_HOST
const mongoPort = process.env.MONGO_PORT
const uri = `mongodb://${mongoHost ?? "localhost"}:${mongoPort ?? "27017"}`;
const dbName = 'aws_data';

const { accountIdToTeam, complianceBreadcrumbs, checkDatabaseDeprecation } = require('../../utils/shared');

router.get('/', async (_, res) => {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName);

        const latestDoc = await db.collection("rds").findOne({}, {
            projection: { year: 1, month: 1, day: 1 },
            sort: { year: -1, month: -1, day: -1 }
        });

        if (!latestDoc) {
            throw new Error("No data found in rds collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const rdsCol = db.collection("rds");
        const redshiftCol = db.collection("redshift_clusters");

        const teamDatabases = new Map();

        const ensureTeam = t => {
            if (!teamDatabases.has(t))
                teamDatabases.set(t, { engines: new Map() });
            return teamDatabases.get(t);
        };

        const rdsCursor = rdsCol.find({
            year: latestYear,
            month: latestMonth,
            day: latestDay
        }, { projection: { account_id: 1, Configuration: 1 } });

        for await (const doc of rdsCursor) {
            const team = accountIdToTeam[doc.account_id] || "Unknown";
            const rec = ensureTeam(team);

            if (doc.Configuration) {
                const engine = doc.Configuration.Engine || "Unknown";
                const version = doc.Configuration.EngineVersion || "Unknown";
                const key = `${engine}-${version}`;
                rec.engines.set(key, (rec.engines.get(key) || 0) + 1);
            }
        }

        const redshiftCursor = redshiftCol.find({
            year: latestYear,
            month: latestMonth,
            day: latestDay
        }, { projection: { account_id: 1, Configuration: 1 } });

        for await (const doc of redshiftCursor) {
            const team = accountIdToTeam[doc.account_id] || "Unknown";
            const rec = ensureTeam(team);

            if (doc.Configuration) {
                const version = doc.Configuration.ClusterVersion || "Unknown";
                const key = `redshift-${version}`;
                rec.engines.set(key, (rec.engines.get(key) || 0) + 1);
            }
        }

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
        console.error(err);
        res.status(500).send("Internal Server Error");
    } finally {
        await client.close();
    }
});

router.get('/details', async (req, res) => {
    const client = new MongoClient(uri);
    const { team, engine, version, search = '', page = 1 } = req.query;
    const pageSize = 25;
    const currentPage = parseInt(page);

    try {
        await client.connect();
        const db = client.db(dbName);

        const latestDoc = await db.collection("rds").findOne({}, {
            projection: { year: 1, month: 1, day: 1 },
            sort: { year: -1, month: -1, day: -1 }
        });

        if (!latestDoc) {
            throw new Error("No data found in rds collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const allResources = [];

        if (engine !== "redshift") {
            const rdsCursor = db.collection("rds").find({
                year: latestYear,
                month: latestMonth,
                day: latestDay
            }, {
                projection: { account_id: 1, resource_id: 1, Configuration: 1 }
            });

            for await (const doc of rdsCursor) {
                const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
                if (docTeam !== team) continue;

                if (doc.Configuration) {
                    const docEngine = doc.Configuration.Engine || "Unknown";
                    const docVersion = doc.Configuration.EngineVersion || "Unknown";

                    const reconstructedKey = `${docEngine}-${docVersion}`;
                    const expectedKey = `${engine}-${version}`;

                    if (reconstructedKey === expectedKey) {
                        allResources.push({
                            resourceId: doc.resource_id,
                            shortName: doc.Configuration.DBInstanceIdentifier || doc.resource_id,
                            engine: docEngine,
                            version: docVersion,
                            accountId: doc.account_id,
                            deprecationWarnings: checkDatabaseDeprecation(docEngine, docVersion),
                            details: {
                                instanceClass: doc.Configuration.DBInstanceClass,
                                status: doc.Configuration.DBInstanceStatus,
                                allocatedStorage: doc.Configuration.AllocatedStorage,
                                storageType: doc.Configuration.StorageType,
                                multiAZ: doc.Configuration.MultiAZ,
                                publiclyAccessible: doc.Configuration.PubliclyAccessible,
                                storageEncrypted: doc.Configuration.StorageEncrypted,
                                availabilityZone: doc.Configuration.AvailabilityZone,
                                endpoint: doc.Configuration.Endpoint?.Address,
                                port: doc.Configuration.Endpoint?.Port
                            }
                        });
                    }
                }
            }
        }

        if (engine === "redshift") {
            const redshiftCursor = db.collection("redshift_clusters").find({
                year: latestYear,
                month: latestMonth,
                day: latestDay
            }, {
                projection: { account_id: 1, resource_id: 1, Configuration: 1 }
            });

            for await (const doc of redshiftCursor) {
                const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
                if (docTeam !== team) continue;

                if (doc.Configuration) {
                    const docVersion = doc.Configuration.ClusterVersion || "Unknown";

                    if (docVersion === version) {
                        allResources.push({
                            resourceId: doc.resource_id,
                            shortName: doc.Configuration.ClusterIdentifier || doc.resource_id,
                            engine: "redshift",
                            version: docVersion,
                            accountId: doc.account_id,
                            deprecationWarnings: checkDatabaseDeprecation("redshift", docVersion),
                            details: {
                                nodeType: doc.Configuration.NodeType,
                                status: doc.Configuration.ClusterStatus,
                                numberOfNodes: doc.Configuration.NumberOfNodes,
                                publiclyAccessible: doc.Configuration.PubliclyAccessible,
                                encrypted: doc.Configuration.Encrypted,
                                availabilityZone: doc.Configuration.AvailabilityZone,
                                endpoint: doc.Configuration.Endpoint?.Address,
                                port: doc.Configuration.Endpoint?.Port,
                                totalStorageGB: doc.Configuration.TotalStorageCapacityInMegaBytes ? Math.round(doc.Configuration.TotalStorageCapacityInMegaBytes / 1024) : null
                            }
                        });
                    }
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
        res.status(500).send("Internal Server Error");
    } finally {
        await client.close();
    }
});

module.exports = router;
