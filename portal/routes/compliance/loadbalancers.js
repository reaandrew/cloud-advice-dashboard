const express = require('express');
const router = express.Router();

const { complianceBreadcrumbs } = require('../../utils/shared');
const lbQueries = require('../../queries/compliance/loadbalancers');

router.get('/', (_, res) => {
    res.redirect('/compliance/loadbalancers/tls');
});

router.get('/tls', async (req, res) => {
    try {
        // Add diagnostic logging to check MongoDB document structure for load balancers
        console.log('--- Load Balancer Debug - Direct MongoDB Query ---');

        // Direct query to get one ELB v2 document and one ELB listener for structure analysis
        const sampleElbV2 = await req.collection("elb_v2").findOne({}, { projection: { resource_id: 1, Configuration: 1 } });
        const sampleListener = await req.collection("elb_v2_listeners").findOne({}, { projection: { loadBalancerArn: 1, LoadBalancerArn: 1, Configuration: 1 } });

        // Get sample ARNs to debug matching issues
        const sampleLbArns = await req.collection("elb_v2").find({}, { projection: { resource_id: 1 } }).limit(3).toArray();

        // Find HTTPS/TLS listeners specifically to debug certificate detection
        console.log('--- Looking for HTTPS/TLS Listeners ---');
        const tlsListeners = await req.collection("elb_v2_listeners").find({
            "Configuration.configuration.Protocol": { $in: ["HTTPS", "TLS"] }
        }, {
            projection: { Configuration: 1 }
        }).limit(3).toArray();

        if (tlsListeners && tlsListeners.length > 0) {
            console.log(`Found ${tlsListeners.length} TLS listeners in the database`);
            tlsListeners.forEach((listener, idx) => {
                console.log(`--- TLS Listener ${idx+1} Details ---`);
                console.log(`Protocol: ${listener?.Configuration?.configuration?.Protocol}`);
                console.log(`SslPolicy: ${listener?.Configuration?.configuration?.SslPolicy}`);
                console.log(`LoadBalancerArn: ${listener?.Configuration?.configuration?.LoadBalancerArn}`);

                // Check for certificates
                if (listener?.Configuration?.configuration?.Certificates) {
                    console.log('Has certificates:', true);
                    console.log('Certificates:', JSON.stringify(listener?.Configuration?.configuration?.Certificates, null, 2));
                } else {
                    console.log('Has certificates:', false);
                }
            });
        } else {
            console.log('No TLS listeners found in the database!');
        }

        if (sampleElbV2) {
            console.log('ELB v2 sample document structure:');
            console.log('Configuration exists:', !!sampleElbV2?.Configuration);
            console.log('Configuration keys:', Object.keys(sampleElbV2?.Configuration || {}));
            if (sampleElbV2?.Configuration?.configuration) {
                console.log('Configuration.configuration exists:', true);
                console.log('Configuration.configuration keys:', Object.keys(sampleElbV2.Configuration.configuration));
            } else {
                console.log('Configuration.configuration exists:', false);
            }
        }

        if (sampleListener) {
            console.log('ELB v2 Listener sample document structure:');
            console.log('LoadBalancerArn exists:', !!sampleListener?.LoadBalancerArn);
            console.log('loadBalancerArn exists:', !!sampleListener?.loadBalancerArn);
            console.log('Configuration exists:', !!sampleListener?.Configuration);
            console.log('Configuration keys:', Object.keys(sampleListener?.Configuration || {}));

            // Check configuration structure
            if (sampleListener?.Configuration?.configuration) {
                console.log('Configuration.configuration exists:', true);
                console.log('Configuration.configuration keys:', Object.keys(sampleListener.Configuration.configuration));

                // Log lowercase field existence
                console.log('Configuration.configuration.protocol exists:', !!sampleListener.Configuration.configuration.protocol);
                console.log('Configuration.configuration.sslPolicy exists:', !!sampleListener.Configuration.configuration.sslPolicy);
                console.log('Configuration.configuration.loadBalancerArn exists:', !!sampleListener.Configuration.configuration.loadBalancerArn);

                // Log uppercase field existence
                console.log('Configuration.configuration.Protocol exists:', !!sampleListener.Configuration.configuration.Protocol);
                console.log('Configuration.configuration.SslPolicy exists:', !!sampleListener.Configuration.configuration.SslPolicy);
                console.log('Configuration.configuration.LoadBalancerArn exists:', !!sampleListener.Configuration.configuration.LoadBalancerArn);

                // Display the actual LoadBalancerArn value if it exists
                if (sampleListener.Configuration.configuration.LoadBalancerArn) {
                    console.log('LoadBalancerArn value:', sampleListener.Configuration.configuration.LoadBalancerArn);
                }

                // Check for certificates
                if (sampleListener.Configuration.configuration.Certificates) {
                    console.log('Configuration.configuration.Certificates exists:', true);
                    console.log('Certificates:', JSON.stringify(sampleListener.Configuration.configuration.Certificates, null, 2));
                } else {
                    console.log('Configuration.configuration.Certificates exists:', false);
                }

                // Check protocol and TLS settings
                if (sampleListener.Configuration.configuration.Protocol === "HTTPS" || sampleListener.Configuration.configuration.Protocol === "TLS") {
                    console.log('This is a TLS listener:', true);
                    console.log('Protocol:', sampleListener.Configuration.configuration.Protocol);
                    console.log('SslPolicy:', sampleListener.Configuration.configuration.SslPolicy);
                } else {
                    console.log('This is a TLS listener:', false);
                    console.log('Protocol:', sampleListener.Configuration.configuration.Protocol);
                }
            } else {
                console.log('Configuration.configuration exists:', false);
            }

            // Check for direct field access
            if (sampleListener?.Configuration?.Protocol) {
                console.log('Configuration.Protocol exists:', true);
            }
            if (sampleListener?.Configuration?.protocol) {
                console.log('Configuration.protocol exists:', true);
            }
        }

        // Debug ARN matching issues
        console.log('--- ARN Matching Debug ---');
        if (sampleLbArns && sampleLbArns.length > 0) {
            console.log('ELB resource_id format examples:');
            sampleLbArns.forEach((lb, i) => {
                console.log(`LB ${i+1} resource_id: ${lb.resource_id}`);
            });
        }

        if (sampleListenerArns && sampleListenerArns.length > 0) {
            console.log('ELB Listener loadBalancerArn format examples:');
            sampleListenerArns.forEach((listener, i) => {
                console.log(`Listener ${i+1} loadBalancerArn: ${listener.loadBalancerArn}`);

                // Extract the actual ARN part from resource_id for comparison
                const sampleLbArn = sampleLbArns && sampleLbArns[i] ? sampleLbArns[i].resource_id : null;
                if (sampleLbArn && listener.loadBalancerArn) {
                    console.log(`Match test ${i+1}: ${sampleLbArn === listener.loadBalancerArn ? 'MATCH' : 'NO MATCH'}`);

                    // If no match, analyze differences
                    if (sampleLbArn !== listener.loadBalancerArn) {
                        // Check if one is contained within the other
                        if (listener.loadBalancerArn.includes(sampleLbArn)) {
                            console.log(`Listener ARN contains LB resource_id`);
                        } else if (sampleLbArn.includes(listener.loadBalancerArn)) {
                            console.log(`LB resource_id contains Listener ARN`);
                        }

                        // Compare last part of ARN (after last /)
                        const lbLastPart = sampleLbArn.split('/').pop();
                        const listenerLastPart = listener.loadBalancerArn.split('/').pop();
                        console.log(`Last part comparison: ${lbLastPart === listenerLastPart ? 'MATCH' : 'NO MATCH'}`);
                    }
                }
            });
        }

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
