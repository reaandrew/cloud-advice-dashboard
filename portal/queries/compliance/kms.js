async function getLatestKmsDate(req) {
    return await req.collection("kms_key_metadata").findOne({}, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { year: -1, month: -1, day: -1 }
    });
}

async function getKmsKeysForDate(req, year, month, day, projection = null) {
    return req.collection("kms_key_metadata").find({
        year: year,
        month: month,
        day: day
    }, projection ? { projection } : {});
}

function getAgeBucket(creationDate) {
    if (!creationDate) return "Unknown";
    const ageInDays = (Date.now() - new Date(creationDate).getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays < 30) return "0-30 days";
    if (ageInDays < 90) return "30-90 days";
    if (ageInDays < 180) return "90-180 days";
    if (ageInDays < 365) return "180-365 days";
    if (ageInDays < 730) return "1-2 years";
    return "2+ years";
}

function getAgeDescription(creationDate) {
    if (!creationDate) return "Unknown";
    const ageInDays = Math.floor((Date.now() - new Date(creationDate).getTime()) / (1000 * 60 * 60 * 24));
    if (ageInDays === 0) return "Today";
    if (ageInDays === 1) return "1 day";
    if (ageInDays < 30) return `${ageInDays} days`;
    if (ageInDays < 365) return `${Math.floor(ageInDays / 30)} months`;
    return `${Math.floor(ageInDays / 365)} years`;
}

async function processKmsKeyAges(req, year, month, day) {
    const teamKeyAges = new Map();

    console.log('=== KMS processKmsKeyAges START ===');
    console.log('Query params - year:', year, 'month:', month, 'day:', day);

    const ensureTeam = t => {
        if (!teamKeyAges.has(t))
            teamKeyAges.set(t, { ageBuckets: new Map() });
        return teamKeyAges.get(t);
    };

    const results = await req.getDetailsForAllAccounts();
    console.log('Account mappings loaded');

    const kmsCursor = await getKmsKeysForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

    let docCount = 0;
    let debugCount = 0;
    let matchedCount = 0;

    for await (const doc of kmsCursor) {
        docCount++;

        // Debug first 3 documents
        if (debugCount < 3) {
            console.log('--- KMS Document Debug ---');
            console.log('account_id:', doc.account_id);
            console.log('Configuration exists:', !!doc.Configuration);
            console.log('Configuration.configuration exists:', !!doc.Configuration?.configuration);
            console.log('Configuration keys:', Object.keys(doc.Configuration || {}));
            if (doc.Configuration?.configuration) {
                console.log('Configuration.configuration keys:', Object.keys(doc.Configuration.configuration));
                console.log('CreationDate (PascalCase):', doc.Configuration.configuration.CreationDate);
                console.log('creationDate (camelCase):', doc.Configuration.configuration.creationDate);
            }
            // Also check direct Configuration access
            console.log('Direct Configuration.CreationDate:', doc.Configuration?.CreationDate);
            console.log('Direct Configuration.creationDate:', doc.Configuration?.creationDate);
            console.log('--------------------------');
            debugCount++;
        }

        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);

        // Try both PascalCase and camelCase
        const creationDate = doc.Configuration?.configuration?.CreationDate ||
                            doc.Configuration?.configuration?.creationDate ||
                            doc.Configuration?.CreationDate ||
                            doc.Configuration?.creationDate;

        if (creationDate) {
            matchedCount++;
            const bucket = getAgeBucket(creationDate);
            recs.map(rec => rec.ageBuckets.set(bucket, (rec.ageBuckets.get(bucket) || 0) + 1));
        }
    }

    console.log('KMS processKmsKeyAges: Total documents processed:', docCount);
    console.log('KMS processKmsKeyAges: Documents with CreationDate:', matchedCount);
    console.log('KMS processKmsKeyAges: Teams found:', Array.from(teamKeyAges.keys()));
    console.log('=== KMS processKmsKeyAges END ===');

    return teamKeyAges;
}

async function getKmsKeyDetails(req, year, month, day, team, ageBucket) {
    const query = {
        year: year,
        month: month,
        day: day,
    };

    const results = await req.getDetailsForAllAccounts();

    const kmsCol = req.collection("kms_key_metadata");
    const cursor = kmsCol.find(query, {
        projection: {
            account_id: 1,
            resource_id: 1,
            Configuration: 1,
            Tags: 1
        }
    });

    const allResources = [];
    for await (const doc of cursor) {
        if (!results.findByAccountId(doc.account_id).teams.find(t => t === team)) continue;

        if (!doc.Configuration?.configuration?.CreationDate) continue;

        const cfg = doc.Configuration.configuration;
        const resourceAgeBucket = getAgeBucket(cfg.CreationDate);
        if (resourceAgeBucket !== ageBucket) continue;

        const resource = {
            resourceId: doc.resource_id,
            keyId: cfg.KeyId || doc.resource_id,
            keyName: cfg.Description || '',
            creationDate: cfg.CreationDate ? new Date(cfg.CreationDate).toLocaleDateString() : 'Unknown',
            ageDescription: getAgeDescription(cfg.CreationDate),
            keyUsage: cfg.KeyUsage,
            keyState: cfg.KeyState,
            keySpec: cfg.KeySpec,
            origin: cfg.Origin,
            description: cfg.Description,
            arn: cfg.Arn || doc.resource_id
        };

        allResources.push(resource);
    }

    return allResources;
}

module.exports = {
    getLatestKmsDate,
    getKmsKeysForDate,
    getAgeBucket,
    getAgeDescription,
    processKmsKeyAges,
    getKmsKeyDetails
};
