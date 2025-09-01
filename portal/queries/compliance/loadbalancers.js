const { accountIdToTeam } = require('../../utils/shared');

const dbName = 'aws_data';

async function getLatestElbDate(client) {
    const db = client.db(dbName);
    return await db.collection("elb_v2").findOne({}, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { year: -1, month: -1, day: -1 }
    });
}

async function getElbV2ForDate(client, year, month, day, projection = null) {
    const db = client.db(dbName);
    return db.collection("elb_v2").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});
}

async function getElbClassicForDate(client, year, month, day, projection = null) {
    const db = client.db(dbName);
    return db.collection("elb_classic").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});
}

async function getElbV2ListenersForDate(client, year, month, day, projection = null) {
    const db = client.db(dbName);
    return db.collection("elb_v2_listeners").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});
}

async function processTlsConfigurations(client, year, month, day) {
    const teamTls = new Map();

    const ensureTeam = t => {
        if (!teamTls.has(t))
            teamTls.set(t, { tlsVersions: new Map(), totalLBs: 0 });
        return teamTls.get(t);
    };

    // Count total ELB v2
    const elbV2Cursor = await getElbV2ForDate(client, year, month, day, { account_id: 1 });
    for await (const doc of elbV2Cursor) {
        const team = accountIdToTeam[doc.account_id] || "Unknown";
        const rec = ensureTeam(team);
        rec.totalLBs++;
    }

    // Count total Classic ELBs
    const elbClassicTotalCursor = await getElbClassicForDate(client, year, month, day, { account_id: 1 });
    for await (const doc of elbClassicTotalCursor) {
        const team = accountIdToTeam[doc.account_id] || "Unknown";
        const rec = ensureTeam(team);
        rec.totalLBs++;
    }

    // Process ELB v2 Listeners
    const elbV2ListenersCursor = await getElbV2ListenersForDate(client, year, month, day, { account_id: 1, Configuration: 1 });
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

    // Process Classic ELBs
    const elbClassicCursor = await getElbClassicForDate(client, year, month, day, { account_id: 1, Configuration: 1 });
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

    return teamTls;
}

async function getLoadBalancerDetails(client, year, month, day, team, tlsVersion) {
    const allResources = [];

    if (tlsVersion === "NO CERTS") {
        // Get ELB v2 without certificates
        const elbV2Cursor = await getElbV2ForDate(client, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });
        
        const teamLoadBalancers = new Map();
        for await (const doc of elbV2Cursor) {
            const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
            if (docTeam === team) {
                teamLoadBalancers.set(doc.resource_id, doc);
            }
        }

        const tlsLoadBalancerArns = new Set();
        const elbV2ListenersCursor = await getElbV2ListenersForDate(client, year, month, day, { LoadBalancerArn: 1, Configuration: 1 });

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

        // Process Classic ELBs without certificates
        const elbClassicCursor = await getElbClassicForDate(client, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

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
        // Get ELB v2 with specific TLS version
        const elbV2Cursor = await getElbV2ForDate(client, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });
        
        const teamLoadBalancers = new Map();
        for await (const doc of elbV2Cursor) {
            const docTeam = accountIdToTeam[doc.account_id] || "Unknown";
            if (docTeam === team) {
                teamLoadBalancers.set(doc.resource_id, doc);
            }
        }

        const elbV2ListenersCursor = await getElbV2ListenersForDate(client, year, month, day, { account_id: 1, LoadBalancerArn: 1, Configuration: 1 });

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

        // Process Classic ELBs with specific TLS version
        const elbClassicCursor = await getElbClassicForDate(client, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

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

    return allResources;
}

async function processLoadBalancerTypes(client, year, month, day) {
    const teamTypes = new Map();

    const ensureTeam = t => {
        if (!teamTypes.has(t))
            teamTypes.set(t, { types: new Map() });
        return teamTypes.get(t);
    };

    const elbV2Cursor = await getElbV2ForDate(client, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of elbV2Cursor) {
        const team = accountIdToTeam[doc.account_id] || "Unknown";
        const rec = ensureTeam(team);
        const type = doc.Configuration?.Type || "Unknown";
        rec.types.set(type, (rec.types.get(type) || 0) + 1);
    }

    const elbClassicCursor = await getElbClassicForDate(client, year, month, day, { account_id: 1 });

    for await (const doc of elbClassicCursor) {
        const team = accountIdToTeam[doc.account_id] || "Unknown";
        const rec = ensureTeam(team);
        rec.types.set("classic", (rec.types.get("classic") || 0) + 1);
    }

    return teamTypes;
}

async function getLoadBalancerTypeDetails(client, year, month, day, team, type) {
    const allResources = [];

    if (type === "classic") {
        const elbClassicCursor = await getElbClassicForDate(client, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

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
        const elbV2Cursor = await getElbV2ForDate(client, year, month, day, { account_id: 1, resource_id: 1, Configuration: 1 });

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