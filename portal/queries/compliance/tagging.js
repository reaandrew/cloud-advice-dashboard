const { mandatoryTags } = require('../../utils/shared');

async function getLatestTagsDate(req) {
    const collection = await req.collection("tags");
    return await collection.findOne({}, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { year: -1, month: -1, day: -1 }
    });
}

async function getTagsForDate(req, year, month, day) {
    return req.collection("tags").find({
        year: year,
        month: month,
        day: day
    }, {
        projection: { day: 1, account_id: 1, resource_id: 1, resource_type: 1, Tags: 1 }
    });
}

async function getTagsForDateWithProjection(req, year, month, day) {
    return req.collection("tags").find({
        year: year,
        month: month,
        day: day
    }, {
        projection: { account_id: 1, resource_id: 1, resource_type: 1, Tags: 1 }
    });
}

async function processTeamsTagCompliance(req, cursor) {
    const teamAgg = new Map();

    const ensureTeam = t => {
        if (!teamAgg.has(t)) {
            teamAgg.set(t, { resourceTypes: new Map(), _seen: new Set() });
        }
        return teamAgg.get(t);
    };

    const ensureResourceType = (teamRec, resourceType) => {
        if (!teamRec.resourceTypes.has(resourceType)) {
            const tagMissing = new Map();
            mandatoryTags.forEach(tag => tagMissing.set(tag, 0));
            teamRec.resourceTypes.set(resourceType, tagMissing);
        }
        return teamRec.resourceTypes.get(resourceType);
    };

    const isMissing = v =>
        v === null || v === undefined || (typeof v === "string" && v.trim() === "");

    const bucketStartsWithAccountId = arn => /^\d{12}/.test((arn.split(":::")[1] || ""));

    const results = await req.getDetailsForAllAccounts();

    for await (const doc of cursor) {
        if (doc.resource_type === "bucket" && bucketStartsWithAccountId(doc.resource_id)) continue;

	const recs = results.findByAccountId(doc.account_id).teams.map(ensureTeam);

        const resourceType = doc.resource_type || "Unknown";

        const uniqueKey = `${doc.account_id}-${doc.resource_id}`;
        const recsUnseen = recs.filter(rec => !rec._seen.has(uniqueKey));
        if (recsUnseen.length === 0) continue;
        recsUnseen.forEach(rec => rec._seen.add(uniqueKey));
        const tagMissings = recsUnseen.map(rec => ensureResourceType(rec, resourceType));

        const tags = {};
        if (doc.Tags && Array.isArray(doc.Tags)) {
            for (const tag of doc.Tags) {
                if (tag.Key && tag.Value !== undefined) {
                    tags[tag.Key.toLowerCase()] = tag.Value;
                }
            }
        }

        for (const originalTagName of mandatoryTags) {
            const tagName = originalTagName.toLowerCase();
            if (originalTagName === "BSP") {
                const hasBillingID = !isMissing(tags["billingid"]);
                const hasService = !isMissing(tags["service"]);
                const hasProject = !isMissing(tags["project"]);
                const bspValid = hasBillingID && (hasService || hasProject);
                if (!bspValid) {
                    tagMissings.forEach(tagMissing => tagMissing.set(originalTagName, tagMissing.get(originalTagName) + 1));
                }
            } else if (isMissing(tags[tagName])) {
                tagMissings.forEach(tagMissing => tagMissing.set(originalTagName, tagMissing.get(originalTagName) + 1));
            }
        }
    }

    return teamAgg;
}

async function processTagDetailsForTeam(req, cursor, team, resourceType, tag) {
    const allResources = [];
    const isMissing = v => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
    const bucketStartsWithAccountId = arn => /^\d{12}/.test((arn.split(":::")[1] || ""));

    for await (const doc of cursor) {
        if (doc.resource_type === "bucket" && bucketStartsWithAccountId(doc.resource_id)) continue;

        if (!(await req.detailsByAccountId(doc.account_id)).teams.find(t => t === team)) continue;

        const tags = {};
        if (doc.Tags && Array.isArray(doc.Tags)) {
            for (const tagItem of doc.Tags) {
                if (tagItem.Key && tagItem.Value !== undefined) {
                    tags[tagItem.Key.toLowerCase()] = tagItem.Value;
                }
            }
        }

        let shouldInclude = false;
        if (tag === "BSP") {
            const hasBillingID = !isMissing(tags["billingid"]);
            const hasService = !isMissing(tags["service"]);
            const hasProject = !isMissing(tags["project"]);
            const bspValid = hasBillingID && (hasService || hasProject);
            shouldInclude = !bspValid;
        } else {
            shouldInclude = isMissing(tags[tag.toLowerCase()]);
        }

        if (shouldInclude) {
            const shortName = doc.resource_id.split('/').pop() || doc.resource_id.split(':').pop() || doc.resource_id;
            allResources.push({
                resourceId: doc.resource_id,
                shortName: shortName,
                accountId: doc.account_id,
                tags: Object.entries(tags).map(([key, value]) => [key, value])
            });
        }
    }

    return allResources;
}

module.exports = {
    getLatestTagsDate,
    getTagsForDate,
    getTagsForDateWithProjection,
    processTeamsTagCompliance,
    processTagDetailsForTeam
};
