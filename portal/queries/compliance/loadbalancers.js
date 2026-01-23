const logger = require('../../libs/logger');

async function getLatestElbDate(req) {
    return await req.collection("elb_v2").findOne({}, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { year: -1, month: -1, day: -1 }
    });
}

async function getElbV2ForDate(req, year, month, day, projection = null) {
    return req.collection("elb_v2").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});
}

async function getElbClassicForDate(req, year, month, day, projection = null) {
    return req.collection("elb_classic").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});
}

async function getElbV2ListenersForDate(req, year, month, day, projection = null) {
    return req.collection("elb_v2_listeners").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});
}

async function processTlsConfigurations(req, year, month, day) {
    const teamTls = new Map();
    let accountDetailsResults;

    const ensureTeam = t => {
        if (!teamTls.has(t))
            teamTls.set(t, { tlsVersions: new Map(), totalLBs: 0 });
        return teamTls.get(t);
    };

    try {
        accountDetailsResults = await req.getDetailsForAllAccounts();

        // Count total ELB v2
        const elbV2Cursor = await getElbV2ForDate(req, year, month, day, { account_id: 1 });

        for await (const doc of elbV2Cursor) {
            try {
                const accountDetails = accountDetailsResults.findByAccountId(doc.account_id);
                const recs = accountDetails.teams.map(ensureTeam);
                recs.forEach(rec => rec.totalLBs++);
            } catch (err) {
                // Skip documents with invalid account_id
            }
        }
    } catch (err) {
        throw err;
    }

    try {
        // Count total Classic ELBs
        const elbClassicTotalCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1 });

        if (!accountDetailsResults) {
            throw new Error('Account details not available');
        }

        for await (const doc of elbClassicTotalCursor) {
            try {
                const accountDetails = accountDetailsResults.findByAccountId(doc.account_id);
                const recs = accountDetails.teams.map(ensureTeam);
                recs.forEach(rec => rec.totalLBs++);
            } catch (err) {
                // Skip documents with invalid account_id
            }
        }

        // Process ELB v2 Listeners
        const elbV2ListenersCursor = await getElbV2ListenersForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

        for await (const doc of elbV2ListenersCursor) {
            try {
                // DEBUG: Log the document structure
                logger.debug('ELB v2 Listener doc keys:', Object.keys(doc));
                logger.debug('doc.Configuration exists:', !!doc.Configuration);
                if (doc.Configuration) {
                    logger.debug('doc.Configuration keys:', Object.keys(doc.Configuration));
                    logger.debug('doc.Configuration.configuration exists:', !!doc.Configuration.configuration);
                    if (doc.Configuration.configuration) {
                        logger.debug('doc.Configuration.configuration keys:', Object.keys(doc.Configuration.configuration));
                        logger.debug('doc.Configuration.configuration.protocol:', doc.Configuration.configuration.protocol);
                        logger.debug('doc.Configuration.configuration.Protocol:', doc.Configuration.configuration.Protocol);
                    }
                }

                if (!doc.account_id) continue;

                const accountDetails = accountDetailsResults.findByAccountId(doc.account_id);
                if (!accountDetails || !accountDetails.teams || !Array.isArray(accountDetails.teams)) continue;

                const recs = accountDetails.teams.map(ensureTeam);

                if (doc.Configuration?.configuration) {
                    const protocol = doc.Configuration.configuration.protocol;
                    if (protocol === "HTTPS" || protocol === "TLS") {
                        const policy = doc.Configuration.configuration.sslPolicy || "Unknown";
                        recs.forEach(rec => rec.tlsVersions.set(policy, (rec.tlsVersions.get(policy) || 0) + 1));
                    }
                }
            } catch (err) {
                // Skip documents with errors
            }
        }

        // Process Classic ELBs
        const elbClassicCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

        for await (const doc of elbClassicCursor) {
            try {
                const accountDetails = accountDetailsResults.findByAccountId(doc.account_id);
                const recs = accountDetails.teams.map(ensureTeam);

                if (doc.Configuration?.configuration?.listenerDescriptions) {
                    for (const listenerDesc of doc.Configuration.configuration.listenerDescriptions) {
                        const listener = listenerDesc.listener;
                        if (listener?.protocol === "HTTPS" || listener?.protocol === "SSL") {
                            const policy = listenerDesc.policyNames?.[0] || "Classic-Default";
                            recs.forEach(rec => rec.tlsVersions.set(policy, (rec.tlsVersions.get(policy) || 0) + 1));
                        }
                    }
                }
            } catch (err) {
                // Skip documents with errors
            }
        }

    } catch (err) {
        // Continue with processing
    }

    return teamTls;
}

async function getLoadBalancerDetails(req, year, month, day, team, tlsVersion) {
    const allResources = [];

    const results = await req.getDetailsForAllAccounts();

    if (tlsVersion === "NO CERTS") {
        // Get ELB v2 without certificates
        const elbV2Cursor = await getElbV2ForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        const teamLoadBalancers = new Map();
        const teamLoadBalancersByShortId = new Map();

        for await (const doc of elbV2Cursor) {
            if (!!results.findByAccountId(doc.account_id).teams.find(t => t === team)) {
                teamLoadBalancers.set(doc.resource_id, doc);
                const shortId = doc.resource_id.split('/').pop();
                teamLoadBalancersByShortId.set(shortId, doc);
            }
        }

        const tlsLoadBalancerArns = new Set();
        const tlsLoadBalancerShortIds = new Set();
        const elbV2ListenersCursor = await getElbV2ListenersForDate(req, year, month, day, { Configuration: 1 });

        for await (const doc of elbV2ListenersCursor) {
            const protocol = doc.Configuration?.configuration?.protocol;

            if (protocol === "HTTPS" || protocol === "TLS") {
                const loadBalancerArn = doc.Configuration?.configuration?.loadBalancerArn;

                if (loadBalancerArn) {
                    tlsLoadBalancerArns.add(loadBalancerArn);
                    const shortId = loadBalancerArn.split('/').pop();
                    tlsLoadBalancerShortIds.add(shortId);
                }
            }
        }

        for (const [resourceId, lbDoc] of teamLoadBalancers) {
            const shortId = resourceId.split('/').pop();
            const hasExactMatch = tlsLoadBalancerArns.has(resourceId);
            const hasShortIdMatch = tlsLoadBalancerShortIds.has(shortId);

            if (!hasExactMatch && !hasShortIdMatch) {
                allResources.push({
                    resourceId: resourceId,
                    shortName: lbDoc.Configuration?.configuration?.loadBalancerName || resourceId,
                    type: lbDoc.Configuration?.configuration?.type || "Unknown",
                    scheme: lbDoc.Configuration?.configuration?.scheme || "Unknown",
                    accountId: lbDoc.account_id,
                    tlsPolicy: "NO CERTS",
                    details: {
                        dnsName: lbDoc.Configuration?.configuration?.dnsName,
                        availabilityZones: lbDoc.Configuration?.configuration?.availabilityZones?.map(az => az.zoneName).join(", "),
                        securityGroups: lbDoc.Configuration?.configuration?.securityGroups?.join(", "),
                        vpcId: lbDoc.Configuration?.configuration?.vpcId,
                        state: lbDoc.Configuration?.configuration?.state?.code
                    }
                });
            }
        }

        // Process Classic ELBs without certificates
        const elbClassicCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        for await (const doc of elbClassicCursor) {
            if (!results.findByAccountId(doc.account_id).teams.find(t => t === team)) continue;

            let hasTLS = false;
            if (doc.Configuration?.configuration?.listenerDescriptions) {
                for (const listenerDesc of doc.Configuration.configuration.listenerDescriptions) {
                    const listener = listenerDesc.listener;
                    if (listener?.protocol === "HTTPS" || listener?.protocol === "SSL") {
                        hasTLS = true;
                        break;
                    }
                }
            }

            if (!hasTLS) {
                allResources.push({
                    resourceId: doc.resource_id,
                    shortName: doc.Configuration?.configuration?.loadBalancerName || doc.resource_id,
                    type: "classic",
                    scheme: doc.Configuration?.configuration?.scheme || "Unknown",
                    accountId: doc.account_id,
                    tlsPolicy: "NO CERTS",
                    details: {
                        dnsName: doc.Configuration?.configuration?.dnsName,
                        availabilityZones: doc.Configuration?.configuration?.availabilityZones?.join(", "),
                        securityGroups: doc.Configuration?.configuration?.securityGroups?.join(", "),
                        vpcId: doc.Configuration?.configuration?.vpcId,
                        state: "active"
                    }
                });
            }
        }
    } else {
        // Get ELB v2 with specific TLS version
        const elbV2Cursor = await getElbV2ForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        const teamLoadBalancers = new Map();
        const teamLoadBalancersByArn = new Map();
        const teamLoadBalancersByShortId = new Map();

        for await (const doc of elbV2Cursor) {
            if (!!results.findByAccountId(doc.account_id).teams.find(t => t === team)) {
                teamLoadBalancers.set(doc.resource_id, doc);
                teamLoadBalancersByArn.set(doc.resource_id, doc);
                const shortId = doc.resource_id.split('/').pop();
                teamLoadBalancersByShortId.set(shortId, doc);
            }
        }

        const elbV2ListenersCursor = await getElbV2ListenersForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

        for await (const doc of elbV2ListenersCursor) {
            if (doc.Configuration?.configuration) {
                const protocol = doc.Configuration.configuration.protocol;
                if (protocol === "HTTPS" || protocol === "TLS") {
                    const policy = doc.Configuration.configuration.sslPolicy || "Unknown";
                    const loadBalancerArn = doc.Configuration.configuration.loadBalancerArn;

                    if (policy === tlsVersion && loadBalancerArn) {
                        let lbDoc = null;

                        if (teamLoadBalancersByArn.has(loadBalancerArn)) {
                            lbDoc = teamLoadBalancersByArn.get(loadBalancerArn);
                        } else {
                            const shortId = loadBalancerArn.split('/').pop();
                            if (teamLoadBalancersByShortId.has(shortId)) {
                                lbDoc = teamLoadBalancersByShortId.get(shortId);
                            }
                        }

                        if (lbDoc) {
                            allResources.push({
                                resourceId: loadBalancerArn,
                                shortName: lbDoc.Configuration?.configuration?.loadBalancerName || loadBalancerArn,
                                type: lbDoc.Configuration?.configuration?.type || "Unknown",
                                scheme: lbDoc.Configuration?.configuration?.scheme || "Unknown",
                                accountId: doc.account_id,
                                tlsPolicy: policy,
                                details: {
                                    dnsName: lbDoc.Configuration?.configuration?.dnsName,
                                    availabilityZones: lbDoc.Configuration?.configuration?.availabilityZones?.map(az => az.zoneName).join(", "),
                                    securityGroups: lbDoc.Configuration?.configuration?.securityGroups?.join(", "),
                                    vpcId: lbDoc.Configuration?.configuration?.vpcId,
                                    state: lbDoc.Configuration?.configuration?.state?.code
                                }
                            });
                        }
                    }
                }
            }
        }

        // Process Classic ELBs with specific TLS version
        const elbClassicCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        for await (const doc of elbClassicCursor) {
            if (!results.findByAccountId(doc.account_id).teams.find(t => t === team)) continue;

            if (doc.Configuration?.configuration?.listenerDescriptions) {
                for (const listenerDesc of doc.Configuration.configuration.listenerDescriptions) {
                    const listener = listenerDesc.listener;
                    if (listener?.protocol === "HTTPS" || listener?.protocol === "SSL") {
                        const policy = listenerDesc.policyNames?.[0] || "Classic-Default";
                        if (policy === tlsVersion) {
                            allResources.push({
                                resourceId: doc.resource_id,
                                shortName: doc.Configuration?.configuration?.loadBalancerName || doc.resource_id,
                                type: "classic",
                                scheme: doc.Configuration?.configuration?.scheme || "Unknown",
                                accountId: doc.account_id,
                                tlsPolicy: policy,
                                details: {
                                    dnsName: doc.Configuration?.configuration?.dnsName,
                                    availabilityZones: doc.Configuration?.configuration?.availabilityZones?.join(", "),
                                    securityGroups: doc.Configuration?.configuration?.securityGroups?.join(", "),
                                    vpcId: doc.Configuration?.configuration?.vpcId,
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

    return allResources;
}

async function processLoadBalancerTypes(req, year, month, day) {
    const teamTypes = new Map();

    const ensureTeam = t => {
        if (!teamTypes.has(t))
            teamTypes.set(t, { types: new Map() });
        return teamTypes.get(t);
    };

    const results = await req.getDetailsForAllAccounts();

    const elbV2Cursor = await getElbV2ForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of elbV2Cursor) {
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);
        const type = doc.Configuration?.configuration?.type || "Unknown";
        recs.forEach(rec => rec.types.set(type, (rec.types.get(type) || 0) + 1));
    }

    const elbClassicCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1 });

    for await (const doc of elbClassicCursor) {
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);
        recs.forEach(rec => rec.types.set("classic", (rec.types.get("classic") || 0) + 1));
    }

    return teamTypes;
}

async function getLoadBalancerTypeDetails(req, year, month, day, team, type) {
    const allResources = [];

    const results = await req.getDetailsForAllAccounts();

    if (type === "classic") {
        const elbClassicCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        for await (const doc of elbClassicCursor) {
            if (!results.findByAccountId(doc.account_id).teams.find(t => t === team)) continue;

            allResources.push({
                resourceId: doc.resource_id,
                shortName: doc.Configuration?.configuration?.loadBalancerName || doc.resource_id,
                type: "classic",
                scheme: doc.Configuration?.configuration?.scheme || "Unknown",
                accountId: doc.account_id,
                details: {
                    dnsName: doc.Configuration?.configuration?.dnsName,
                    availabilityZones: doc.Configuration?.configuration?.availabilityZones?.join(", "),
                    securityGroups: doc.Configuration?.configuration?.securityGroups?.join(", "),
                    vpcId: doc.Configuration?.configuration?.vpcId,
                    createdTime: doc.Configuration?.configuration?.createdTime
                }
            });
        }
    } else {
        const elbV2Cursor = await getElbV2ForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        for await (const doc of elbV2Cursor) {
            if (!results.findByAccountId(doc.account_id).teams.find(t => t === team)) continue;

            const docType = doc.Configuration?.configuration?.type;
            if (docType === type) {
                allResources.push({
                    resourceId: doc.resource_id,
                    shortName: doc.Configuration?.configuration?.loadBalancerName || doc.resource_id,
                    type: (() => {
                        if (docType === "application") return "ALB";
                        if (docType === "network") return "NLB";
                        if (docType === "classic") return "Classic";
                        return docType;
                    })(),
                    scheme: doc.Configuration?.configuration?.scheme || "Unknown",
                    accountId: doc.account_id,
                    details: {
                        dnsName: doc.Configuration?.configuration?.dnsName,
                        availabilityZones: doc.Configuration?.configuration?.availabilityZones?.map(az => az.zoneName).join(", "),
                        securityGroups: doc.Configuration?.configuration?.securityGroups?.join(", "),
                        vpcId: doc.Configuration?.configuration?.vpcId,
                        state: doc.Configuration?.configuration?.state?.code,
                        createdTime: doc.Configuration?.configuration?.createdTime
                    }
                });
            }
        }
    }

    return allResources;
}

module.exports = {
    getLatestElbDate,
    getElbV2ForDate,
    getElbClassicForDate,
    getElbV2ListenersForDate,
    processTlsConfigurations,
    getLoadBalancerDetails,
    processLoadBalancerTypes,
    getLoadBalancerTypeDetails
};
