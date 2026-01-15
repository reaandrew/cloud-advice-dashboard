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

    const ensureTeam = t => {
        if (!teamTls.has(t))
            teamTls.set(t, { tlsVersions: new Map(), totalLBs: 0 });
        return teamTls.get(t);
    };

    const results = await req.getDetailsForAllAccounts();

    // Count total ELB v2
    const elbV2Cursor = await getElbV2ForDate(req, year, month, day, { account_id: 1 });
    for await (const doc of elbV2Cursor) {
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);
        recs.forEach(rec => rec.totalLBs++);
    }

    // Count total Classic ELBs
    const elbClassicTotalCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1 });
    for await (const doc of elbClassicTotalCursor) {
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);
        recs.forEach(rec => rec.totalLBs++);
    }

    // Process ELB v2 Listeners
    const elbV2ListenersCursor = await getElbV2ListenersForDate(req, year, month, day, { account_id: 1, Configuration: 1 });
    for await (const doc of elbV2ListenersCursor) {
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);

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
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);

        if (doc.Configuration?.ListenerDescriptions) {
            for (const listenerDesc of doc.Configuration.ListenerDescriptions) {
                const listener = listenerDesc.Listener;
                if (listener?.Protocol === "HTTPS" || listener?.Protocol === "SSL") {
                    const policy = listenerDesc.PolicyNames?.[0] || "Classic-Default";
                    recs.map(rec => rec.tlsVersions.set(policy, (rec.tlsVersions.get(policy) || 0) + 1));
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
        // Get ELB v2 without certificates
        const elbV2Cursor = await getElbV2ForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        const teamLoadBalancers = new Map();
        // Create a secondary map to lookup by LoadBalancerArn
        const teamLoadBalancersByArn = new Map();
        for await (const doc of elbV2Cursor) {
            if (!!results.findByAccountId(doc.account_id).teams.find(t => t === team)) {
                teamLoadBalancers.set(doc.resource_id, doc);
                // Also map using resource_id as LoadBalancerArn for lookup
                teamLoadBalancersByArn.set(doc.resource_id, doc);
            }
        }

        const tlsLoadBalancerArns = new Set();
        const elbV2ListenersCursor = await getElbV2ListenersForDate(req, year, month, day, { LoadBalancerArn: 1, Configuration: 1 });

        for await (const doc of elbV2ListenersCursor) {
            if (doc.Configuration?.Protocol === "HTTPS" || doc.Configuration?.Protocol === "TLS") {
                tlsLoadBalancerArns.add(doc.LoadBalancerArn);
            }
        }

        for (const [resourceId, lbDoc] of teamLoadBalancers) {
            // Check if the LoadBalancerArn (which is in resourceId) exists in the set
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

        // Process Classic ELBs without certificates
        const elbClassicCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        for await (const doc of elbClassicCursor) {
            if (!results.findByAccountId(doc.account_id).teams.find(t => t === team)) continue;

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
        // Create a secondary map to lookup by LoadBalancerArn
        const teamLoadBalancersByArn = new Map();
        for await (const doc of elbV2Cursor) {
            if (!!results.findByAccountId(doc.account_id).teams.find(t => t === team)) {
                teamLoadBalancers.set(doc.resource_id, doc);
                // Also map using resource_id as LoadBalancerArn for lookup
                teamLoadBalancersByArn.set(doc.resource_id, doc);
            }
        }

        const elbV2ListenersCursor = await getElbV2ListenersForDate(req, year, month, day, { account_id: 1, LoadBalancerArn: 1, Configuration: 1 });

        for await (const doc of elbV2ListenersCursor) {
            if (doc.Configuration) {
                const protocol = doc.Configuration.Protocol;
                if (protocol === "HTTPS" || protocol === "TLS") {
                    const policy = doc.Configuration.SslPolicy || "Unknown";
                    if (policy === tlsVersion && teamLoadBalancersByArn.has(doc.LoadBalancerArn)) {
                        const lbDoc = teamLoadBalancersByArn.get(doc.LoadBalancerArn);
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

        // Process Classic ELBs with specific TLS version
        const elbClassicCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

        for await (const doc of elbClassicCursor) {
            if (!results.findByAccountId(doc.account_id).teams.find(t => t === team)) continue;

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
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);

        const type = doc.Configuration?.Type || "Unknown";
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
            if (!results.findByAccountId(doc.account_id).teams.find(t => t === team)) continue;

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
    processTlsConfigurations,
    getLoadBalancerDetails,
    processLoadBalancerTypes,
    getLoadBalancerTypeDetails
};
