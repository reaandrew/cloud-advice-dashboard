
const { createLoadBalancerLogger } = require('../../libs/file-logger');

// Initialize the loadbalancer file logger
const logger = createLoadBalancerLogger();

async function getLatestElbDate(req) {
    logger.info('Attempting to get latest ELB date from MongoDB');
    const result = await req.collection("elb_v2").findOne({}, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { year: -1, month: -1, day: -1 }
    });
    logger.info('Latest ELB date result:', result);
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

async function processTlsConfigurations(req, year, month, day) {
    logger.info(`Processing TLS Configurations for date: ${year}-${month}-${day}`);

    const teamTls = new Map();
    // Declare results at the top level of the function so it's in scope for all blocks
    let accountDetailsResults;

    const ensureTeam = t => {
        logger.debug(`Ensuring team: ${t}`);
        if (!teamTls.has(t))
            teamTls.set(t, { tlsVersions: new Map(), totalLBs: 0 });
        return teamTls.get(t);
    };

    try {
        logger.info('Getting account details from req.getDetailsForAllAccounts()...');
        accountDetailsResults = await req.getDetailsForAllAccounts();

        // Check if getDetailsForAllAccounts is working correctly
        const accountIds = ['123456789012', '987654321098', '111222333444'];
        for (const id of accountIds) {
            logger.info(`Testing account ID: ${id}`);
            try {
                const details = accountDetailsResults.findByAccountId(id);
                logger.info(`Account ${id} details:`, details);
                logger.info(`Teams for account ${id}:`, details.teams);
            } catch (err) {
                logger.error(`Error looking up account ${id}:`, err);
            }
        }

        logger.info('Account details retrieved successfully');

        // Count total ELB v2
        logger.info(`Getting ELB v2 documents for ${year}-${month}-${day}...`);
        const elbV2Cursor = await getElbV2ForDate(req, year, month, day, { account_id: 1 });
        let elbCount = 0;
        logger.info('Iterating through ELB v2 documents...');

        for await (const doc of elbV2Cursor) {
            elbCount++;
            logger.debug(`Processing ELB document ${elbCount} with account_id: ${doc.account_id}`);
            try {
                const accountDetails = accountDetailsResults.findByAccountId(doc.account_id);
                logger.debug(`Account details teams for ${doc.account_id}: ${JSON.stringify(accountDetails.teams)}`);
                const recs = accountDetails.teams.map(ensureTeam);
                recs.forEach(rec => rec.totalLBs++);
            } catch (err) {
                logger.error(`Error processing ELB document with account_id ${doc.account_id}:`, err);
            }
        }

        logger.info(`Processed ${elbCount} ELB v2 documents`);
    } catch (err) {
        logger.error('Error in processTlsConfigurations:', err);
        throw err;
    }

    try {
        // Count total Classic ELBs
        logger.info('Getting classic ELB documents...');
        const elbClassicTotalCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1 });
        let classicCount = 0;

        // Make sure we use the accountDetailsResults from above
        if (!accountDetailsResults) {
            logger.error('Account details results not available for classic ELB processing');
            throw new Error('Account details not available');
        }

        for await (const doc of elbClassicTotalCursor) {
            classicCount++;
            logger.debug(`Processing classic ELB document ${classicCount} with account_id: ${doc.account_id}`);
            try {
                const accountDetails = accountDetailsResults.findByAccountId(doc.account_id);
                logger.debug(`Classic ELB - account details teams for ${doc.account_id}: ${JSON.stringify(accountDetails.teams)}`);
                const recs = accountDetails.teams.map(ensureTeam);
                recs.forEach(rec => rec.totalLBs++);
            } catch (err) {
                logger.error(`Error processing classic ELB document with account_id ${doc.account_id}:`, err);
            }
        }
        logger.info(`Processed ${classicCount} classic ELB documents`);

        // Process ELB v2 Listeners
        logger.info('Getting ELB v2 listener documents...');
        const elbV2ListenersCursor = await getElbV2ListenersForDate(req, year, month, day, { account_id: 1, Configuration: 1 });
        let listenerCount = 0;
        let tlsListenerCount = 0;

        for await (const doc of elbV2ListenersCursor) {
            listenerCount++;
            logger.debug(`Processing ELB v2 listener document ${listenerCount} with account_id: ${doc.account_id}`);
            try {
                logger.info(`Finding account details for listener document ${listenerCount} with account_id: ${doc.account_id}`);

                if (!doc.account_id) {
                    logger.error(`Listener document ${listenerCount} is missing account_id field`);
                    continue;
                }

                // Get account details and handle possible issues
                const accountDetails = accountDetailsResults.findByAccountId(doc.account_id);

                if (!accountDetails) {
                    logger.error(`Account details not found for account_id: ${doc.account_id}`);
                    continue;
                }

                if (!accountDetails.teams || !Array.isArray(accountDetails.teams)) {
                    logger.error(`Invalid or missing teams array for account_id: ${doc.account_id}`);
                    logger.debug(`Account details structure: ${JSON.stringify(accountDetails)}`);
                    continue;
                }

                logger.debug(`Listener - account details teams for ${doc.account_id}: ${JSON.stringify(accountDetails.teams)}`);
                const recs = accountDetails.teams.map(ensureTeam);

                if (doc.Configuration?.configuration) {
                    const protocol = doc.Configuration.configuration.Protocol;
                    logger.debug(`Listener protocol for ${doc.account_id}: ${protocol}`);
                    if (protocol === "HTTPS" || protocol === "TLS") {
                        tlsListenerCount++;
                        const policy = doc.Configuration.configuration.SslPolicy || "Unknown";
                        logger.info(`Found TLS listener #${tlsListenerCount} with policy: ${policy}`);
                        recs.forEach(rec => rec.tlsVersions.set(policy, (rec.tlsVersions.get(policy) || 0) + 1));
                    }
                } else {
                    logger.warn(`Listener document ${listenerCount} with account_id ${doc.account_id} missing Configuration.configuration structure`);
                }
            } catch (err) {
                logger.error(`Error processing listener document with account_id ${doc.account_id}:`,
                    err.message || 'Unknown error',
                    err.stack || 'No stack trace');
            }
        }
        logger.info(`Processed ${listenerCount} ELB v2 listener documents (${tlsListenerCount} with TLS)`);

        // Process Classic ELBs
        logger.info('Getting classic ELB detail documents...');
        const elbClassicCursor = await getElbClassicForDate(req, year, month, day, { account_id: 1, Configuration: 1 });
        let classicDetailCount = 0;
        let classicTlsCount = 0;

        for await (const doc of elbClassicCursor) {
            classicDetailCount++;
            logger.debug(`Processing classic ELB detail document ${classicDetailCount} with account_id: ${doc.account_id}`);
            try {
                const accountDetails = accountDetailsResults.findByAccountId(doc.account_id);
                const recs = accountDetails.teams.map(ensureTeam);

                if (doc.Configuration?.configuration?.listenerDescriptions) {
                    for (const listenerDesc of doc.Configuration.configuration.listenerDescriptions) {
                        const listener = listenerDesc.listener;
                        if (listener?.protocol === "HTTPS" || listener?.protocol === "SSL") {
                            classicTlsCount++;
                            const policy = listenerDesc.policyNames?.[0] || "Classic-Default";
                            logger.info(`Found classic TLS listener #${classicTlsCount} with policy: ${policy}`);
                            recs.forEach(rec => rec.tlsVersions.set(policy, (rec.tlsVersions.get(policy) || 0) + 1));
                        }
                    }
                } else {
                    logger.debug(`Classic ELB document ${classicDetailCount} with account_id ${doc.account_id} missing listenerDescriptions`);
                }
            } catch (err) {
                logger.error(`Error processing classic ELB detail document with account_id ${doc.account_id}:`, err);
            }
        }
        logger.info(`Processed ${classicDetailCount} classic ELB detail documents (${classicTlsCount} with TLS)`);

    } catch (err) {
        logger.error('Error processing ELB data:', err);
        // Continue with processing, don't throw here
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
        // Create more robust secondary maps to handle ARN matching edge cases
        const teamLoadBalancersByArn = new Map();
        const teamLoadBalancersByShortId = new Map(); // Map by the resource ID's last part after '/'

        console.log('--- Debug: ELB TLS Resolution Process (NO CERTS) ---');
        console.log('Looking for load balancers WITHOUT certificates');
        let debugCount = 0;

        for await (const doc of elbV2Cursor) {
            if (!!results.findByAccountId(doc.account_id).teams.find(t => t === team)) {
                console.log(`Adding team LB: ${doc.resource_id}`);
                teamLoadBalancers.set(doc.resource_id, doc);

                // Primary ARN matching - exact resource_id
                teamLoadBalancersByArn.set(doc.resource_id, doc);

                // Secondary ARN matching - last part of the ARN for partial matches
                const shortId = doc.resource_id.split('/').pop();
                console.log(`Adding team LB short ID: ${shortId}`);
                teamLoadBalancersByShortId.set(shortId, doc);

                // Debug the first few load balancers
                if (debugCount < 3) {
                    console.log(`Load Balancer ${debugCount+1} resource_id: ${doc.resource_id}`);
                    console.log(`Load Balancer ${debugCount+1} short ID: ${shortId}`);
                    debugCount++;
                }
            }
        }

        const tlsLoadBalancerArns = new Set();
        const tlsLoadBalancerShortIds = new Set(); // Store short IDs too
        const elbV2ListenersCursor = await getElbV2ListenersForDate(req, year, month, day, { Configuration: 1 });

        let listenerDebugCount = 0;
        let totalListeners = 0;
        let tlsListenersFound = 0;
        let arnsFound = 0;

        console.log('--- Debug: ELB Listeners With TLS ---');
        console.log('Looking for TLS listeners with certificates');

        for await (const doc of elbV2ListenersCursor) {
            totalListeners++;

            // Debug the first few listeners regardless of protocol
            if (listenerDebugCount < 2) {
                console.log(`Listener ${listenerDebugCount+1} document structure:`);
                console.log(`Has Configuration: ${!!doc.Configuration}`);
                console.log(`Has Configuration.configuration: ${!!doc.Configuration?.configuration}`);
                if (doc.Configuration?.configuration) {
                    console.log(`Configuration.configuration keys: ${Object.keys(doc.Configuration.configuration).join(', ')}`);
                    // Add debug for LoadBalancerArn
                    if (doc.Configuration.configuration.LoadBalancerArn) {
                        console.log(`Listener ${listenerDebugCount+1} Configuration.configuration.LoadBalancerArn: ${doc.Configuration.configuration.LoadBalancerArn}`);
                    }
                }
            }

            // Use exact field names from schema
            const protocol = doc.Configuration?.configuration?.Protocol;

            if (protocol === "HTTPS" || protocol === "TLS") {
                tlsListenersFound++;

                // Use exact field name from schema
                const loadBalancerArn = doc.Configuration?.configuration?.LoadBalancerArn;

                if (loadBalancerArn) {
                    arnsFound++;
                    console.log(`Adding TLS ARN: ${loadBalancerArn}`);
                    tlsLoadBalancerArns.add(loadBalancerArn);

                    // Also store the short ID (resource ID part after the last slash)
                    const shortId = loadBalancerArn.split('/').pop();
                    console.log(`Adding TLS short ID: ${shortId}`);
                    tlsLoadBalancerShortIds.add(shortId);

                    // Debug output for the first few TLS listeners
                    if (listenerDebugCount < 5) {
                        console.log(`TLS Listener ${listenerDebugCount+1} loadBalancerArn: ${loadBalancerArn}`);
                        console.log(`TLS Listener ${listenerDebugCount+1} short ID: ${shortId}`);
                        console.log(`TLS Listener ${listenerDebugCount+1} protocol: ${protocol}`);
                        console.log(`TLS Listener ${listenerDebugCount+1} policy: ${
                            doc.Configuration?.configuration?.SslPolicy || 'Not set'
                        }`);

                        // Check for certificates
                        const certificates = doc.Configuration?.configuration?.Certificates;
                        if (certificates) {
                            console.log(`TLS Listener ${listenerDebugCount+1} has certificates:`, true);
                            console.log(`Certificate data:`, JSON.stringify(certificates).substring(0, 100) + '...');
                        } else {
                            console.log(`TLS Listener ${listenerDebugCount+1} has certificates:`, false);
                        }

                        listenerDebugCount++;
                    }
                } else {
                    // Log issues with missing ARNs
                    if (listenerDebugCount < 10) {
                        console.log(`WARNING: Found TLS listener but no LoadBalancerArn! Protocol: ${protocol}`);
                        listenerDebugCount++;
                    }
                }
            }
        }

        console.log(`ELB TLS Stats: Total listeners: ${totalListeners}, TLS listeners: ${tlsListenersFound}, ARNs found: ${arnsFound}`);
        console.log(`TLS ARN Set size: ${tlsLoadBalancerArns.size}, Short ID Set size: ${tlsLoadBalancerShortIds.size}`);

        // Log the contents of our sets for debugging
        console.log('--- Debug: TLS Load Balancer ARNs ---');
        console.log([...tlsLoadBalancerArns].slice(0, 5).join('\n'));
        console.log('--- Debug: TLS Load Balancer Short IDs ---');
        console.log([...tlsLoadBalancerShortIds].slice(0, 5).join('\n'));

        console.log('--- Debug: Load Balancers Without Certs Detection ---');
        let noCertsCount = 0;
        let withCertsCount = 0;

        for (const [resourceId, lbDoc] of teamLoadBalancers) {
            // Extract the short ID for this load balancer
            const shortId = resourceId.split('/').pop();

            // Try multiple matching strategies to determine if this LB has certificates
            const hasExactMatch = tlsLoadBalancerArns.has(resourceId);
            const hasShortIdMatch = tlsLoadBalancerShortIds.has(shortId);

            // Print out more detailed debugging
            console.log(`Checking LB ${resourceId} (short ID: ${shortId}) for TLS certificates`);
            console.log(`ARN exact match: ${hasExactMatch}`);
            console.log(`Short ID match: ${hasShortIdMatch}`);
            // Make this test case-insensitive as a debug check
            console.log(`Case-insensitive ARN check: ${[...tlsLoadBalancerArns].some(arn => arn.toLowerCase() === resourceId.toLowerCase())}`);
            console.log(`Case-insensitive Short ID check: ${[...tlsLoadBalancerShortIds].some(id => id.toLowerCase() === shortId.toLowerCase())}`);

            // Check if the LoadBalancer has TLS certs - now with multiple matching strategies
            if (!hasExactMatch && !hasShortIdMatch) {
                // Debug output for the first few NO CERTS load balancers
                if (noCertsCount < 3) {
                    console.log(`NO CERTS LB ${noCertsCount+1} resource_id: ${resourceId}`);
                    console.log(`NO CERTS LB ${noCertsCount+1} short ID: ${shortId}`);
                    console.log(`NO CERTS LB ${noCertsCount+1} exact match: ${hasExactMatch}`);
                    console.log(`NO CERTS LB ${noCertsCount+1} short ID match: ${hasShortIdMatch}`);
                    noCertsCount++;
                }

                allResources.push({
                    resourceId: resourceId,
                    shortName: lbDoc.Configuration?.configuration?.loadBalancerName || resourceId,
                    type: lbDoc.Configuration?.configuration?.type || "Unknown",
                    scheme: lbDoc.Configuration?.configuration?.scheme || "Unknown",
                    accountId: lbDoc.account_id,
                    tlsPolicy: "NO CERTS",
                    details: {
                        dnsName: lbDoc.Configuration?.configuration?.DNSName,
                        availabilityZones: lbDoc.Configuration?.configuration?.availabilityZones?.map(az => az.zoneName).join(", "),
                        securityGroups: lbDoc.Configuration?.configuration?.securityGroups?.join(", "),
                        vpcId: lbDoc.Configuration?.configuration?.vpcId,
                        state: lbDoc.Configuration?.configuration?.state?.code
                    }
                });
            } else {
                // Debug the first few LBs that DO have certificates
                if (withCertsCount < 3) {
                    console.log(`WITH CERTS LB ${withCertsCount+1} resource_id: ${resourceId}`);
                    console.log(`WITH CERTS LB ${withCertsCount+1} short ID: ${shortId}`);
                    console.log(`WITH CERTS LB ${withCertsCount+1} matched by: ${hasExactMatch ? 'exact match' : 'short ID match'}`);
                    withCertsCount++;
                }
            }
        }

        console.log(`Total load balancers checked: ${teamLoadBalancers.size}`);
        console.log(`Total TLS listener ARNs found: ${tlsLoadBalancerArns.size}`);
        console.log(`Total TLS listener short IDs found: ${tlsLoadBalancerShortIds.size}`);
        console.log(`Total NO CERTS load balancers detected: ${allResources.length}`);

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
        // Create more robust secondary maps to handle ARN matching edge cases
        const teamLoadBalancersByArn = new Map();
        const teamLoadBalancersByShortId = new Map(); // Map by the resource ID's last part after '/'

        console.log('--- Debug: ELB Specific TLS Version Resolution Process ---');
        console.log(`Looking for TLS version: ${tlsVersion}`);
        let debugCount = 0;

        for await (const doc of elbV2Cursor) {
            if (!!results.findByAccountId(doc.account_id).teams.find(t => t === team)) {
                teamLoadBalancers.set(doc.resource_id, doc);

                // Primary ARN matching - exact resource_id
                teamLoadBalancersByArn.set(doc.resource_id, doc);

                // Secondary ARN matching - last part of the ARN for partial matches
                const shortId = doc.resource_id.split('/').pop();
                teamLoadBalancersByShortId.set(shortId, doc);

                // Debug the first few load balancers
                if (debugCount < 3) {
                    console.log(`Load Balancer ${debugCount+1} resource_id: ${doc.resource_id}`);
                    console.log(`Load Balancer ${debugCount+1} short ID: ${shortId}`);
                    debugCount++;
                }
            }
        }

        const elbV2ListenersCursor = await getElbV2ListenersForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

        let specificTlsDebugCount = 0;
        console.log('--- Debug: ELB Listeners Matching Specific TLS Version ---');

        for await (const doc of elbV2ListenersCursor) {
            if (doc.Configuration?.configuration) {
                // Fields are uppercase in the listener documents
                const protocol = doc.Configuration.configuration.Protocol;
                if (protocol === "HTTPS" || protocol === "TLS") {
                    const policy = doc.Configuration.configuration.SslPolicy || "Unknown";
                    const loadBalancerArn = doc.Configuration.configuration.LoadBalancerArn;

                    // Debug first few listeners with TLS policies
                    if (specificTlsDebugCount < 3) {
                        console.log(`TLS Listener ${specificTlsDebugCount+1} ARN: ${loadBalancerArn}`);
                        console.log(`TLS Listener ${specificTlsDebugCount+1} Protocol: ${protocol}`);
                        console.log(`TLS Listener ${specificTlsDebugCount+1} Policy: ${policy}`);
                        console.log(`TLS Listener ${specificTlsDebugCount+1} Target Policy: ${tlsVersion}`);
                        specificTlsDebugCount++;
                    }

                    if (policy === tlsVersion && loadBalancerArn) {
                        // Try to find the load balancer by multiple matching strategies
                        let lbDoc = null;
                        let matchType = '';

                        // Try direct ARN matching first
                        if (teamLoadBalancersByArn.has(loadBalancerArn)) {
                            lbDoc = teamLoadBalancersByArn.get(loadBalancerArn);
                            matchType = 'exact match';
                        }
                        // Try short ID matching as fallback
                        else {
                            const shortId = loadBalancerArn.split('/').pop();
                            if (teamLoadBalancersByShortId.has(shortId)) {
                                lbDoc = teamLoadBalancersByShortId.get(shortId);
                                matchType = 'short ID match';
                            }
                        }

                        if (lbDoc) {
                            console.log(`Found matching LB for policy ${policy} via ${matchType}`);

                            allResources.push({
                                resourceId: loadBalancerArn,
                                shortName: lbDoc.Configuration?.configuration?.loadBalancerName || loadBalancerArn,
                                type: lbDoc.Configuration?.configuration?.type || "Unknown",
                                scheme: lbDoc.Configuration?.configuration?.scheme || "Unknown",
                                accountId: doc.account_id,
                                tlsPolicy: policy,
                                details: {
                                    dnsName: lbDoc.Configuration?.configuration?.DNSName,
                                    availabilityZones: lbDoc.Configuration?.configuration?.availabilityZones?.map(az => az.zoneName).join(", "),
                                    securityGroups: lbDoc.Configuration?.configuration?.securityGroups?.join(", "),
                                    vpcId: lbDoc.Configuration?.configuration?.vpcId,
                                    state: lbDoc.Configuration?.configuration?.state?.code
                                }
                            });
                        } else if (policy === tlsVersion) {
                            console.log(`WARNING: Found TLS listener with policy ${policy} but couldn't match to any LB: ${loadBalancerArn}`);
                        }
                    }
                }
            }
        }

        console.log(`Total LBs with ${tlsVersion} policy found: ${allResources.length}`);

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
