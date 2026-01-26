async function getLatestKmsDate(req) {
    return await req.collection("kms_keys").findOne({}, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { year: -1, month: -1, day: -1 }
    });
}

async function getKmsKeysForDate(req, year, month, day, projection = null) {
    return req.collection("kms_keys").find({
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

    const ensureTeam = t => {
        if (!teamKeyAges.has(t))
            teamKeyAges.set(t, { ageBuckets: new Map() });
        return teamKeyAges.get(t);
    };

    const results = await req.getDetailsForAllAccounts();
    const kmsCursor = await getKmsKeysForDate(req, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of kmsCursor) {
        const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);

        const creationDate = doc.Configuration?.configuration?.creationDate;

        if (creationDate) {
            const bucket = getAgeBucket(creationDate);
            recs.map(rec => rec.ageBuckets.set(bucket, (rec.ageBuckets.get(bucket) || 0) + 1));
        }
    }

    return teamKeyAges;
}

async function getKmsKeyDetails(req, year, month, day, team, ageBucket) {
    const query = {
        year: year,
        month: month,
        day: day,
    };

    const results = await req.getDetailsForAllAccounts();

    const kmsCol = req.collection("kms_keys");
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

        const cfg = doc.Configuration?.configuration;
        if (!cfg?.creationDate) continue;

        const resourceAgeBucket = getAgeBucket(cfg.creationDate);
        if (resourceAgeBucket !== ageBucket) continue;

        const resource = {
            resourceId: doc.resource_id,
            keyId: cfg.keyId || doc.resource_id,
            keyName: cfg.description || '',
            creationDate: cfg.creationDate ? new Date(cfg.creationDate).toLocaleDateString() : 'Unknown',
            ageDescription: getAgeDescription(cfg.creationDate),
            keyUsage: cfg.keyUsage,
            keyState: cfg.keyState,
            keySpec: cfg.keySpec,
            origin: cfg.origin,
            description: cfg.description,
            arn: cfg.arn || doc.resource_id
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
