const express = require('express');
const { MongoClient } = require('mongodb');
const router = express.Router();

const mongoHost = process.env.MONGO_HOST
const mongoPort = process.env.MONGO_PORT
const uri = `mongodb://${mongoHost ?? "localhost"}:${mongoPort ?? "27017"}`;
const dbName = 'aws_data';

const { accountIdToTeam, complianceBreadcrumbs } = require('../../utils/shared');

router.get('/', (_, res) => {
    res.redirect('/compliance/loadbalancers/tls');
});

router.get('/tls', async (req, res) => {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName);

        const latestDoc = await db.collection("elb_v2").findOne({}, {
            projection: { year: 1, month: 1, day: 1 },
            sort: { year: -1, month: -1, day: -1 }
        });

        if (!latestDoc) {
            throw new Error("No data found in elb_v2 collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const elbV2Col = db.collection("elb_v2");
        const elbV2ListenersCol = db.collection("elb_v2_listeners");
        const elbClassicCol = db.collection("elb_classic");

        const teamTls = new Map();

        const ensureTeam = t => {
            if (!teamTls.has(t))
                teamTls.set(t, { tlsVersions: new Map(), totalLBs: 0 });
            return teamTls.get(t);
        };

        const elbV2Cursor = elbV2Col.find({
            year: latestYear,
            month: latestMonth,
            day: latestDay
        }, { projection: { account_id: 1 } });
        for await (const doc of elbV2Cursor) {
            const team = accountIdToTeam[doc.account_id] || "Unknown";
            const rec = ensureTeam(team);
            rec.totalLBs++;
        }

        const elbClassicTotalCursor = elbClassicCol.find({
            year: latestYear,
            month: latestMonth,
            day: latestDay
        }, { projection: { account_id: 1 } });
        for await (const doc of elbClassicTotalCursor) {
            const team = accountIdToTeam[doc.account_id] || "Unknown";
            const rec = ensureTeam(team);
            rec.totalLBs++;
        }

        const elbV2ListenersCursor = elbV2ListenersCol.find({
            year: latestYear,
            month: latestMonth,
            day: latestDay
        }, { projection: { account_id: 1, Configuration: 1 } });

        for await (const doc of elbV2ListenersCursor) {
            const team = accountIdToTeam[doc.account_id] || "Unknown";
            const rec = ensureTeam(team);

            if (doc.Configuration) {
                const protocol = doc.Configuration.Protocol;
                if (protocol === "HTTPS" || protocol === "TLS") {
                    const policy = doc.Configuration.SslPolicy || "Unknown";
                    rec.tlsVersions.set(policy, (rec.tlsVersions.get(policy) || 0) + 1);
                }
            }
        }

        const elbClassicCursor = elbClassicCol.find({
            year: latestYear,
            month: latestMonth,
            day: latestDay
        }, { projection: { account_id: 1, Configuration: 1 } });

        for await (const doc of elbClassicCursor) {
            const team = accountIdToTeam[doc.account_id] || "Unknown";
            const rec = ensureTeam(team);

            if (doc.Configuration?.ListenerDescriptions) {
                for (const listenerDesc of doc.Configuration.ListenerDescriptions) {
                    const listener = listenerDesc.Listener;
                    if (listener?.Protocol === "HTTPS" || listener?.Protocol === "SSL") {
                        const policy = listenerDesc.PolicyNames?.[0] || "Classic-Default";
                        rec.tlsVersions.set(policy, (rec.tlsVersions.get(policy) || 0) + 1);
                    }
                }
            }
        }

        const isDeprecatedPolicy = (version) => {
            return version.startsWith('ELBSecurityPolicy-2015') ||
                version.startsWith('ELBSecurityPolicy-2016') ||
                version === 'Classic-Default' ||
                version.includes('TLS-1-0') ||
                version.includes('TLS-1-1');
        };

        const data = [...teamTls.entries()].map(([team, rec]) => {
            const totalWithTLS = [...rec.tlsVersions.values()].reduce((sum, count) => sum + count, 0);
            const noCertsCount = rec.totalLBs - totalWithTLS;
            const tlsVersions = [...rec.tlsVersions.entries()].map(([version, count]) => ({
                version,
                count,
                isDeprecated: isDeprecatedPolicy(version),
                isNoCerts: false
            }));

            if (noCertsCount > 0) {
                tlsVersions.push({
                    version: 'NO CERTS',
                    count: noCertsCount,
                    isDeprecated: false,
                    isNoCerts: true
                });
            }

            return {
                team,
                tlsVersions,
                totalLBs: rec.totalLBs
            };
        }).filter(t => t.totalLBs > 0);

        res.render('policies/loadbalancers/tls.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "Load Balancers", href: "/compliance/loadbalancers" }],
            policy_title: "Load Balancer TLS Configurations",
            menu_items: [
                { href: "/compliance/loadbalancers/tls", text: "TLS Configurations" },
                { href: "/compliance/loadbalancers/types", text: "Load Balancer Types" }
            ],
            data,
            currentSection: "compliance",
            currentPath: "/compliance/loadbalancers/tls"
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
    const { team, tlsVersion, search = '', page = 1 } = req.query;
    const pageSize = 25;
    const currentPage = parseInt(page);

    try {
        await client.connect();
        const db = client.db(dbName);

        const latestDoc = await db.collection("elb_v2").findOne({}, {
            projection: { year: 1, month: 1, day: 1 },
            sort: { year: -1, month: -1, day: -1 }
        });

        if (!latestDoc) {
            throw new Error("No data found in elb_v2 collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const allResources = [];

        if (tlsVersion === "NO CERTS") {
            const elbV2Cursor = db.collection("elb_v2").find({
                year: latestYear,
                month: latestMonth,
                day: latestDay
            }, {
                projection: { account_id: 1, resource_id: 1, Configuration: 1 }
            });

            const teamLoadBalancers = new Map();
            for await (const doc of elbV2Cursor) {
                const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
                if (docTeam === team) {
                    teamLoadBalancers.set(doc.resource_id, doc);
                }
            }

            const tlsLoadBalancerArns = new Set();
            const elbV2ListenersCursor = db.collection("elb_v2_listeners").find({
                year: latestYear,
                month: latestMonth,
                day: latestDay
            }, { projection: { LoadBalancerArn: 1, Configuration: 1 } });

            for await (const doc of elbV2ListenersCursor) {
                if (doc.Configuration?.Protocol === "HTTPS" || doc.Configuration?.Protocol === "TLS") {
                    tlsLoadBalancerArns.add(doc.LoadBalancerArn);
                }
            }

            for (const [resourceId, lbDoc] of teamLoadBalancers) {
                if (!tlsLoadBalancerArns.has(resourceId)) {
                    allResources.push({
                        resourceId: resourceId,
                        shortName: lbDoc.Configuration?.LoadBalancerName || resourceId,
                        type: lbDoc.Configuration?.Type || "Unknown",
                        scheme: lbDoc.Configuration?.Scheme || "Unknown",
                        accountId: lbDoc.account_id,
                        tlsPolicy: "NO CERTS",
                        details: {
                            dnsName: lbDoc.Configuration?.DNSName,
                            availabilityZones: lbDoc.Configuration?.AvailabilityZones?.map(az => az.ZoneName).join(", "),
                            securityGroups: lbDoc.Configuration?.SecurityGroups?.join(", "),
                            vpcId: lbDoc.Configuration?.VpcId,
                            state: lbDoc.Configuration?.State?.Code
                        }
                    });
                }
            }

            const elbClassicCursor = db.collection("elb_classic").find({
                year: latestYear,
                month: latestMonth,
                day: latestDay
            }, {
                projection: { account_id: 1, resource_id: 1, Configuration: 1 }
            });

            for await (const doc of elbClassicCursor) {
                const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
                if (docTeam !== team) continue;

                let hasTLS = false;
                if (doc.Configuration?.ListenerDescriptions) {
                    for (const listenerDesc of doc.Configuration.ListenerDescriptions) {
                        const listener = listenerDesc.Listener;
                        if (listener?.Protocol === "HTTPS" || listener?.Protocol === "SSL") {
                            hasTLS = true;
                            break;
                        }
                    }
                }

                if (!hasTLS) {
                    allResources.push({
                        resourceId: doc.resource_id,
                        shortName: doc.Configuration?.LoadBalancerName || doc.resource_id,
                        type: "classic",
                        scheme: doc.Configuration?.Scheme || "Unknown",
                        accountId: doc.account_id,
                        tlsPolicy: "NO CERTS",
                        details: {
                            dnsName: doc.Configuration?.DNSName,
                            availabilityZones: doc.Configuration?.AvailabilityZones?.join(", "),
                            securityGroups: doc.Configuration?.SecurityGroups?.join(", "),
                            vpcId: doc.Configuration?.VPCId,
                            state: "active"
                        }
                    });
                }
            }
        } else {
            const elbV2Cursor = db.collection("elb_v2").find({
                year: latestYear,
                month: latestMonth,
                day: latestDay
            }, {
                projection: { account_id: 1, resource_id: 1, Configuration: 1 }
            });

            const teamLoadBalancers = new Map();
            for await (const doc of elbV2Cursor) {
                const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
                if (docTeam === team) {
                    teamLoadBalancers.set(doc.resource_id, doc);
                }
            }

            const elbV2ListenersCursor = db.collection("elb_v2_listeners").find({
                year: latestYear,
                month: latestMonth,
                day: latestDay
            }, {
                projection: { account_id: 1, LoadBalancerArn: 1, Configuration: 1 }
            });

            for await (const doc of elbV2ListenersCursor) {
                if (doc.Configuration) {
                    const protocol = doc.Configuration.Protocol;
                    if (protocol === "HTTPS" || protocol === "TLS") {
                        const policy = doc.Configuration.SslPolicy || "Unknown";
                        if (policy === tlsVersion && teamLoadBalancers.has(doc.LoadBalancerArn)) {
                            const lbDoc = teamLoadBalancers.get(doc.LoadBalancerArn);
                            allResources.push({
                                resourceId: doc.LoadBalancerArn,
                                shortName: lbDoc.Configuration?.LoadBalancerName || doc.LoadBalancerArn,
                                type: lbDoc.Configuration?.Type || "Unknown",
                                scheme: lbDoc.Configuration?.Scheme || "Unknown",
                                accountId: doc.account_id,
                                tlsPolicy: policy,
                                details: {
                                    dnsName: lbDoc.Configuration?.DNSName,
                                    availabilityZones: lbDoc.Configuration?.AvailabilityZones?.map(az => az.ZoneName).join(", "),
                                    securityGroups: lbDoc.Configuration?.SecurityGroups?.join(", "),
                                    vpcId: lbDoc.Configuration?.VpcId,
                                    state: lbDoc.Configuration?.State?.Code
                                }
                            });
                        }
                    }
                }
            }

            const elbClassicCursor = db.collection("elb_classic").find({
                year: latestYear,
                month: latestMonth,
                day: latestDay
            }, {
                projection: { account_id: 1, resource_id: 1, Configuration: 1 }
            });

            for await (const doc of elbClassicCursor) {
                const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
                if (docTeam !== team) continue;

                if (doc.Configuration?.ListenerDescriptions) {
                    for (const listenerDesc of doc.Configuration.ListenerDescriptions) {
                        const listener = listenerDesc.Listener;
                        if (listener?.Protocol === "HTTPS" || listener?.Protocol === "SSL") {
                            const policy = listenerDesc.PolicyNames?.[0] || "Classic-Default";
                            if (policy === tlsVersion) {
                                allResources.push({
                                    resourceId: doc.resource_id,
                                    shortName: doc.Configuration?.LoadBalancerName || doc.resource_id,
                                    type: "classic",
                                    scheme: doc.Configuration?.Scheme || "Unknown",
                                    accountId: doc.account_id,
                                    tlsPolicy: policy,
                                    details: {
                                        dnsName: doc.Configuration?.DNSName,
                                        availabilityZones: doc.Configuration?.AvailabilityZones?.join(", "),
                                        securityGroups: doc.Configuration?.SecurityGroups?.join(", "),
                                        vpcId: doc.Configuration?.VPCId,
                                        state: "active"
                                    }
                                });
                                break;
                            }
                        }
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

        res.render('policies/loadbalancers/details.njk', {
            breadcrumbs: [...complianceBreadcrumbs,
            { text: "Load Balancers", href: "/compliance/loadbalancers" },
            { text: `${team} - ${tlsVersion}`, href: "#" }
            ],
            policy_title: `Load Balancers with ${tlsVersion} - ${team} Team`,
            team,
            tlsVersion,
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
            currentPath: "/compliance/loadbalancers/details"
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    } finally {
        await client.close();
    }
});

router.get('/types', async (req, res) => {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName);

        const latestDoc = await db.collection("elb_v2").findOne({}, {
            projection: { year: 1, month: 1, day: 1 },
            sort: { year: -1, month: -1, day: -1 }
        });

        if (!latestDoc) {
            throw new Error("No data found in elb_v2 collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const elbV2Col = db.collection("elb_v2");
        const elbClassicCol = db.collection("elb_classic");

        const teamTypes = new Map();
        let totalV2Count = 0;
        let totalClassicCount = 0;

        const ensureTeam = t => {
            if (!teamTypes.has(t))
                teamTypes.set(t, { types: new Map() });
            return teamTypes.get(t);
        };

        const elbV2Cursor = elbV2Col.find({
            year: latestYear,
            month: latestMonth,
            day: latestDay
        }, { projection: { account_id: 1, Configuration: 1 } });

        for await (const doc of elbV2Cursor) {
            totalV2Count++;
            const team = accountIdToTeam[doc.account_id] || "Unknown";
            const rec = ensureTeam(team);
            const type = doc.Configuration?.Type || "Unknown";
            rec.types.set(type, (rec.types.get(type) || 0) + 1);
        }

        const elbClassicCursor = elbClassicCol.find({
            year: latestYear,
            month: latestMonth,
            day: latestDay
        }, { projection: { account_id: 1 } });

        for await (const doc of elbClassicCursor) {
            totalClassicCount++;
            const team = accountIdToTeam[doc.account_id] || "Unknown";
            const rec = ensureTeam(team);
            rec.types.set("classic", (rec.types.get("classic") || 0) + 1);
        }

        console.log(`Debug: Total ELB v2: ${totalV2Count}, Total Classic: ${totalClassicCount}`);
        console.log(`Debug: Teams found: ${[...teamTypes.keys()].join(', ')}`);

        const data = [...teamTypes.entries()].map(([team, rec]) => ({
            team,
            types: [...rec.types.entries()].map(([type, count]) => ({
                type: type === "application" ? "ALB" : type === "network" ? "NLB" : type === "classic" ? "Classic" : type,
                count
            }))
        })).filter(t => t.types.length > 0);

        res.render('policies/loadbalancers/types.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "Load Balancers", href: "/compliance/loadbalancers" }],
            policy_title: "Load Balancer Types by Team",
            menu_items: [
                { href: "/compliance/loadbalancers/tls", text: "TLS Configurations" },
                { href: "/compliance/loadbalancers/types", text: "Load Balancer Types" }
            ],
            data,
            currentSection: "compliance",
            currentPath: "/compliance/loadbalancers/types"
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    } finally {
        await client.close();
    }
});

router.get('/types/details', async (req, res) => {
    const client = new MongoClient(uri);
    const { team, type, search = '', page = 1 } = req.query;
    const pageSize = 25;
    const currentPage = parseInt(page);

    try {
        await client.connect();
        const db = client.db(dbName);

        const latestDoc = await db.collection("elb_v2").findOne({}, {
            projection: { year: 1, month: 1, day: 1 },
            sort: { year: -1, month: -1, day: -1 }
        });

        if (!latestDoc) {
            throw new Error("No data found in elb_v2 collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const allResources = [];

        if (type === "classic") {
            const elbClassicCursor = db.collection("elb_classic").find({
                year: latestYear,
                month: latestMonth,
                day: latestDay
            }, {
                projection: { account_id: 1, resource_id: 1, Configuration: 1 }
            });

            for await (const doc of elbClassicCursor) {
                const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
                if (docTeam !== team) continue;

                allResources.push({
                    resourceId: doc.resource_id,
                    shortName: doc.Configuration?.LoadBalancerName || doc.resource_id,
                    type: "classic",
                    scheme: doc.Configuration?.Scheme || "Unknown",
                    accountId: doc.account_id,
                    details: {
                        dnsName: doc.Configuration?.DNSName,
                        availabilityZones: doc.Configuration?.AvailabilityZones?.join(", "),
                        securityGroups: doc.Configuration?.SecurityGroups?.join(", "),
                        vpcId: doc.Configuration?.VPCId,
                        createdTime: doc.Configuration?.CreatedTime
                    }
                });
            }
        } else {
            const elbV2Cursor = db.collection("elb_v2").find({
                year: latestYear,
                month: latestMonth,
                day: latestDay
            }, {
                projection: { account_id: 1, resource_id: 1, Configuration: 1 }
            });

            for await (const doc of elbV2Cursor) {
                const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
                if (docTeam !== team) continue;

                const docType = doc.Configuration?.Type;
                if (docType === type) {
                    allResources.push({
                        resourceId: doc.resource_id,
                        shortName: doc.Configuration?.LoadBalancerName || doc.resource_id,
                        type: docType === "application" ? "ALB" : docType === "network" ? "NLB" : docType,
                        scheme: doc.Configuration?.Scheme || "Unknown",
                        accountId: doc.account_id,
                        details: {
                            dnsName: doc.Configuration?.DNSName,
                            availabilityZones: doc.Configuration?.AvailabilityZones?.map(az => az.ZoneName).join(", "),
                            securityGroups: doc.Configuration?.SecurityGroups?.join(", "),
                            vpcId: doc.Configuration?.VpcId,
                            state: doc.Configuration?.State?.Code,
                            createdTime: doc.Configuration?.CreatedTime
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

        const displayType = type === "application" ? "ALB" : type === "network" ? "NLB" : "Classic";

        res.render('policies/loadbalancers/types/details.njk', {
            breadcrumbs: [...complianceBreadcrumbs,
            { text: "Load Balancers", href: "/compliance/loadbalancers" },
            { text: "Types", href: "/compliance/loadbalancers/types" },
            { text: `${team} - ${displayType}`, href: "#" }
            ],
            policy_title: `${displayType} Load Balancers - ${team} Team`,
            team,
            type: displayType,
            originalType: type,
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
            currentPath: "/compliance/loadbalancers/types/details"
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    } finally {
        await client.close();
    }
});

module.exports = router;
