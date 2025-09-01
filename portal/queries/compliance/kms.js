const { accountIdToTeam } = require('../../utils/shared');

const dbName = 'aws_data';

async function getLatestKmsDate(client) {
    const db = client.db(dbName);
    return await db.collection("kms_key_metadata").findOne({}, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { year: -1, month: -1, day: -1 }
    });
}

async function getKmsKeysForDate(client, year, month, day, projection = null) {
    const db = client.db(dbName);
    return db.collection("kms_key_metadata").find({
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

async function processKmsKeyAges(client, year, month, day) {
    const teamKeyAges = new Map();

    const ensureTeam = t => {
        if (!teamKeyAges.has(t))
            teamKeyAges.set(t, { ageBuckets: new Map() });
        return teamKeyAges.get(t);
    };

    const kmsCursor = await getKmsKeysForDate(client, year, month, day, { account_id: 1, Configuration: 1 });

    for await (const doc of kmsCursor) {
        const team = accountIdToTeam[doc.account_id] || "Unknown";
        const rec = ensureTeam(team);

        if (doc.Configuration?.CreationDate) {
            const bucket = getAgeBucket(doc.Configuration.CreationDate);
            rec.ageBuckets.set(bucket, (rec.ageBuckets.get(bucket) || 0) + 1);
        }
    }

    return teamKeyAges;
}

async function getKmsKeyDetails(client, year, month, day, team, ageBucket) {
    const db = client.db(dbName);
    const teamAccountIds = Object.entries(accountIdToTeam)
        .filter(([_, teamName]) => teamName === team)
        .map(([accountId, _]) => accountId);

    if (teamAccountIds.length === 0) {
        throw new Error(`No account IDs found for team: ${team}`);
    }

    const query = {
        year: year,
        month: month,
        day: day,
        account_id: { $in: teamAccountIds }
    };

    const kmsCol = db.collection("kms_key_metadata");
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
        if (!doc.Configuration?.CreationDate) continue;
        
        const resourceAgeBucket = getAgeBucket(doc.Configuration.CreationDate);
        if (resourceAgeBucket !== ageBucket) continue;

        const resource = {
            resourceId: doc.resource_id,
            keyId: doc.Configuration.KeyId || doc.resource_id,
            keyName: doc.Configuration.Description || '',
            creationDate: doc.Configuration.CreationDate ? new Date(doc.Configuration.CreationDate).toLocaleDateString() : 'Unknown',
            ageDescription: getAgeDescription(doc.Configuration.CreationDate),
            keyUsage: doc.Configuration.KeyUsage,
            keyState: doc.Configuration.KeyState,
            keySpec: doc.Configuration.KeySpec,
            origin: doc.Configuration.Origin,
            description: doc.Configuration.Description,
            arn: doc.Configuration.Arn || doc.resource_id
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