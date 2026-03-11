async function getLatestElbDate(req) {
    const result = await req.collection("elb_v2").findOne({}, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { year: -1, month: -1, day: -1 }
    });
    return result;
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

/**
 * Get NLBs that have ONLY TCP/UDP/TCP_UDP listeners (no TLS listeners).
 * These should be excluded from TLS certificate evaluation since they operate at layer 4.
 * @returns {Set} Set of NLB ARNs to exclude from TLS evaluation
 */
async function getNlbsWithOnlyTcpUdpListeners(req, year, month, day) {
    const nlbArns = new Set();
    const nlbsWithTlsListeners = new Set();

    // Get all NLBs (type="network")
    const elbV2Cursor = await getElbV2ForDate(req, year, month, day, { resource_id: 1, Configuration: 1 });
    for await (const doc of elbV2Cursor) {
        const type = doc.Configuration?.Type;
        if (type === "network") {
            nlbArns.add(doc.resource_id);
        }
    }

    // Check which NLBs have TLS listeners
    const listenersCursor = await getElbV2ListenersForDate(req, year, month, day, { Configuration: 1 });
    for await (const doc of listenersCursor) {
        const protocol = doc.Configuration?.Protocol;
        const loadBalancerArn = doc.Configuration?.LoadBalancerArn;

        if (loadBalancerArn && protocol === "TLS") {
            nlbsWithTlsListeners.add(loadBalancerArn);
            // Also check by short ID for cross-account ARN matching
            const shortId = loadBalancerArn.split('/').pop();
            for (const nlbArn of nlbArns) {
                if (nlbArn.split('/').pop() === shortId) {
                    nlbsWithTlsListeners.add(nlbArn);
                }
            }
        }
    }

    // Return NLBs that have NO TLS listeners (only TCP/UDP)
    const tcpUdpOnlyNlbs = new Set();
    for (const nlbArn of nlbArns) {
        if (!nlbsWithTlsListeners.has(nlbArn)) {
            tcpUdpOnlyNlbs.add(nlbArn);
        }
    }

    return tcpUdpOnlyNlbs;
}

async function processTlsConfigurations(req, year, month, day) {
    const teamTls = new Map();
    let accountDetailsResults;

    const ensureTeam = t => {
        if (!teamTls.has(t))
            teamTls.set(t, { tlsVersions: new Map(), totalLBs: 0 });
        return teamTls.get(t);
    };

    accountDetailsResults = await req.getDetailsForAllAccounts();

    // Get NLBs with only TCP/UDP listeners to exclude from TLS evaluation
    const tcpUdpOnlyNlbs = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

    // Count total ELB v2 (excluding TCP/UDP-only NLBs)
    const elbV2Cursor = await getElbV2ForDate(req, year, month, day, { account_id: 1, resource_id: 1 });

    for await (const doc of elbV2Cursor) {
        // Skip NLBs with only TCP/UDP listeners
        if (tcpUdpOnlyNlbs.has(doc.resource_id)) {
            continue;
        }

        const accountDetails = accountDetailsResults.findByAccountId(doc.account_id);
        const recs = (accountDetails?.teams || []).map(ensureTeam);
        recs.forEach(rec => rec.totalLBs++);
    }

    // Count total Classic ELBs
    const elbClassicTotalCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1 });

    for await (const doc of elbClassicTotalCursor) {
        const accountDetails = accountDetailsResults.findByAccountId(doc.account_id);
        const recs = (accountDetails?.teams || []).map(ensureTeam);
        recs.forEach(rec => rec.totalLBs++);
    }

    // Process ELB v2 Listeners
    const elbV2ListenersCursor = await getElbV2ListenersForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of elbV2ListenersCursor) {
        if (!doc.account_id) continue;

        const accountDetails = accountDetailsResults.findByAccountId(doc.account_id);
        if (!accountDetails || !accountDetails.teams || !Array.isArray(accountDetails.teams)) continue;

        const recs = accountDetails.teams.map(ensureTeam);

        if (doc.Configuration) {
            const protocol = doc.Configuration.Protocol;
            if (protocol === "HTTPS" || protocol === "TLS") {
                const policy = doc.Configuration.SslPolicy || "Unknown";
                recs.forEach(rec => rec.tlsVersions.set(policy, (rec.tlsVersions.get(policy) || 0) + 1));
            }
        }
    }

    // Process Classic ELBs
    const elbClassicCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of elbClassicCursor) {
        const accountDetails = accountDetailsResults.findByAccountId(doc.account_id);
        const recs = (accountDetails?.teams || []).map(ensureTeam);

        if (doc.Configuration?.ListenerDescriptions) {
            for (const listenerDesc of doc.Configuration.ListenerDescriptions) {
                const listener = listenerDesc.Listener;
                if (listener?.Protocol === "HTTPS" || listener?.Protocol === "SSL") {
                    const policy = listenerDesc.PolicyNames?.[0] || "Classic-Default";
                    recs.forEach(rec => rec.tlsVersions.set(policy, (rec.tlsVersions.get(policy) || 0) + 1));
                }
            }
        }
    }

    return teamTls;
}

async function getLoadBalancerDetails(req, year, month, day, team, tlsVersion) {
    const allResources = [];

    const results = await req.getDetailsForAllAccounts();

    if (tlsVersion === "NO CERTS") {
        // Get NLBs with only TCP/UDP listeners to exclude from evaluation
        const tcpUdpOnlyNlbs = await getNlbsWithOnlyTcpUdpListeners(req, year, month, day);

        // Get ELB v2 without certificates (excluding TCP/UDP-only NLBs)
        const elbV2Cursor = await getElbV2ForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        const teamLoadBalancers = new Map();
        const teamLoadBalancersByShortId = new Map();

        for await (const doc of elbV2Cursor) {
            // Skip NLBs with only TCP/UDP listeners
            if (tcpUdpOnlyNlbs.has(doc.resource_id)) continue;

            if (results.findByAccountId(doc.account_id)?.teams?.find(t => t === team)) {
                teamLoadBalancers.set(doc.resource_id, doc);
                const shortId = doc.resource_id.split('/').pop();
                teamLoadBalancersByShortId.set(shortId, doc);
            }
        }

        const tlsLoadBalancerArns = new Set();
        const tlsLoadBalancerShortIds = new Set();
        const elbV2ListenersCursor = await getElbV2ListenersForDate(req, year, month, day, { Configuration: 1 });

        for await (const doc of elbV2ListenersCursor) {
            const protocol = doc.Configuration?.Protocol;

            if (protocol === "HTTPS" || protocol === "TLS") {
                const loadBalancerArn = doc.Configuration?.LoadBalancerArn;

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

        // Process Classic ELBs without certificates
        const elbClassicCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        for await (const doc of elbClassicCursor) {
            if (!results.findByAccountId(doc.account_id)?.teams?.find(t => t === team)) continue;

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
                        vpcId: doc.Configuration?.VpcId,
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
            if (results.findByAccountId(doc.account_id)?.teams?.find(t => t === team)) {
                teamLoadBalancers.set(doc.resource_id, doc);
                teamLoadBalancersByArn.set(doc.resource_id, doc);
                const shortId = doc.resource_id.split('/').pop();
                teamLoadBalancersByShortId.set(shortId, doc);
            }
        }

        const elbV2ListenersCursor = await getElbV2ListenersForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

        for await (const doc of elbV2ListenersCursor) {
            if (doc.Configuration) {
                const protocol = doc.Configuration.Protocol;
                if (protocol === "HTTPS" || protocol === "TLS") {
                    const policy = doc.Configuration.SslPolicy || "Unknown";
                    const loadBalancerArn = doc.Configuration.LoadBalancerArn;

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
                                shortName: lbDoc.Configuration?.LoadBalancerName || loadBalancerArn,
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
        }

        // Process Classic ELBs with specific TLS version
        const elbClassicCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        for await (const doc of elbClassicCursor) {
            if (!results.findByAccountId(doc.account_id)?.teams?.find(t => t === team)) continue;

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
                                    vpcId: doc.Configuration?.VpcId,
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
        const accountDetails = results.findByAccountId(doc.account_id);
        const recs = (accountDetails?.teams || []).map(ensureTeam);
        const type = doc.Configuration?.Type || "Unknown";
        recs.forEach(rec => rec.types.set(type, (rec.types.get(type) || 0) + 1));
    }

    const elbClassicCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1 });

    for await (const doc of elbClassicCursor) {
        const accountDetails = results.findByAccountId(doc.account_id);
        const recs = (accountDetails?.teams || []).map(ensureTeam);
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
            if (!results.findByAccountId(doc.account_id)?.teams?.find(t => t === team)) continue;

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
                    vpcId: doc.Configuration?.VpcId,
                    createdTime: doc.Configuration?.CreatedTime
                }
            });
        }
    } else {
        const elbV2Cursor = await getElbV2ForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        for await (const doc of elbV2Cursor) {
            if (!results.findByAccountId(doc.account_id)?.teams?.find(t => t === team)) continue;

            const docType = doc.Configuration?.Type;
            if (docType === type) {
                allResources.push({
                    resourceId: doc.resource_id,
                    shortName: doc.Configuration?.LoadBalancerName || doc.resource_id,
                    type: (() => {
                        if (docType === "application") return "ALB";
                        if (docType === "network") return "NLB";
                        if (docType === "classic") return "Classic";
                        return docType;
                    })(),
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

    return allResources;
}

module.exports = {
    getLatestElbDate,
    getElbV2ForDate,
    getElbClassicForDate,
    getElbV2ListenersForDate,
    getNlbsWithOnlyTcpUdpListeners,
    processTlsConfigurations,
    getLoadBalancerDetails,
    processLoadBalancerTypes,
    getLoadBalancerTypeDetails
};
