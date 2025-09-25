const express = require('express');
const router = express.Router();

const { complianceBreadcrumbs } = require('../../utils/shared');
const lbQueries = require('../../queries/compliance/loadbalancers');

router.get('/', (_, res) => {
    res.redirect('/compliance/loadbalancers/tls');
});

router.get('/tls', async (req, res) => {
    try {
        const latestDoc = await lbQueries.getLatestElbDate(req);

        if (!latestDoc) {
            throw new Error("No data found in elb_v2 collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const teamTls = await lbQueries.processTlsConfigurations(req, latestYear, latestMonth, latestDay);

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
        res.render('errors/no-data.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "Load Balancers", href: "/compliance/loadbalancers" }],
            policy_title: "Load Balancer TLS Configurations",
            currentSection: "compliance",
            currentPath: "/compliance/loadbalancers/tls"
        });
    }
});

router.get('/details', async (req, res) => {
    const { team, tlsVersion, search = '', page = 1 } = req.query;
    const pageSize = 25;
    const currentPage = parseInt(page);

    try {
        const latestDoc = await lbQueries.getLatestElbDate(req);

        if (!latestDoc) {
            throw new Error("No data found in elb_v2 collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const allResources = await lbQueries.getLoadBalancerDetails(req, latestYear, latestMonth, latestDay, team, tlsVersion);

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
        res.render('errors/no-data.njk', {
            breadcrumbs: [...complianceBreadcrumbs,
                { text: "Load Balancers", href: "/compliance/loadbalancers" },
                { text: `${team} - ${tlsVersion}`, href: "#" }
            ],
            policy_title: `Load Balancers with ${tlsVersion} - ${team} Team`,
            currentSection: "compliance",
            currentPath: "/compliance/loadbalancers/details"
        });
    }
});

router.get('/types', async (req, res) => {
    try {
        const latestDoc = await lbQueries.getLatestElbDate(req);

        if (!latestDoc) {
            throw new Error("No data found in elb_v2 collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const teamTypes = await lbQueries.processLoadBalancerTypes(req, latestYear, latestMonth, latestDay);

        const data = [...teamTypes.entries()].map(([team, rec]) => ({
            team,
            types: [...rec.types.entries()].map(([type, count]) => ({
                type: (() => {
                    if (type === "application") return "ALB";
                    if (type === "network") return "NLB";
                    if (type === "classic") return "Classic";
                    return type;
                })(),
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
        res.render('errors/no-data.njk', {
            breadcrumbs: [...complianceBreadcrumbs, { text: "Load Balancers", href: "/compliance/loadbalancers" }],
            policy_title: "Load Balancer Types by Team",
            currentSection: "compliance",
            currentPath: "/compliance/loadbalancers/types"
        });
    }
});

router.get('/types/details', async (req, res) => {
    const { team, type, search = '', page = 1 } = req.query;
    const pageSize = 25;
    const currentPage = parseInt(page);

    try {
        const latestDoc = await lbQueries.getLatestElbDate(req);

        if (!latestDoc) {
            throw new Error("No data found in elb_v2 collection");
        }

        const { year: latestYear, month: latestMonth, day: latestDay } = latestDoc;

        const allResources = await lbQueries.getLoadBalancerTypeDetails(req, latestYear, latestMonth, latestDay, team, type);

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

        let displayType;
        if (type === "application") {
            displayType = "ALB";
        } else if (type === "network") {
            displayType = "NLB";
        } else {
            displayType = "Classic";
        }

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
        res.render('errors/no-data.njk', {
            breadcrumbs: [...complianceBreadcrumbs,
                { text: "Load Balancers", href: "/compliance/loadbalancers" },
                { text: "Types", href: "/compliance/loadbalancers/types" },
                { text: `${team} - ${displayType}`, href: "#" }
            ],
            policy_title: `${displayType} Load Balancers - ${team} Team`,
            currentSection: "compliance",
            currentPath: "/compliance/loadbalancers/types/details"
        });
    }
});

module.exports = router;
