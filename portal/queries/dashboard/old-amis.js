const DashboardMetric = require('./base');

class OldAMIsMetric extends DashboardMetric {
    constructor() {
        super({
            id: 'old-amis',
            title: 'AMIs < 90 Days Old',
            description: 'AMIs created within the last 90 days',
            category: 'infrastructure',
            order: 10,
            colorScheme: 'success'
        });
    }

    async calculate(req, year, month, day) {
        const amisCollection = req.collection("amis");

        const targetDate = new Date(year, month - 1, day);
        const ninetyDaysAgo = new Date(targetDate);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const amisCursor = await amisCollection.find({
            year: year,
            month: month,
            day: day
        });

        let totalAMIs = 0;
        let recentAMIs = 0;

        for await (const doc of amisCursor) {
            totalAMIs++;

            // Access the CreationDate from the Configuration field
            const config = doc.Configuration || {};
            if (config.CreationDate) {
                const creationDate = new Date(config.CreationDate);
                if (creationDate > ninetyDaysAgo) {
                    recentAMIs++;
                }
            }
        }

        if (totalAMIs === 0) {
            return 'N/A';
        }

        const oldAMIs = totalAMIs - recentAMIs;
        if (oldAMIs === 0) {
            return 100;
        }

        return Math.round((recentAMIs / totalAMIs) * 100);
    }

    async getSummaries(req, year, month, day) {
        const amisCollection = req.collection("amis");

        const targetDate = new Date(year, month - 1, day);
        const ninetyDaysAgo = new Date(targetDate);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const thirtyDaysAgo = new Date(targetDate);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const oneEightyDaysAgo = new Date(targetDate);
        oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);

        const amisCursor = await amisCollection.find({
            year: year,
            month: month,
            day: day
        });

        let totalAMIs = 0;
        let recentAMIs = 0;
        let oldAMIs = 0;
        let veryOldAMIs = 0;
        let last30Days = 0;

        for await (const doc of amisCursor) {
            totalAMIs++;

            const config = doc.Configuration || {};
            if (config.CreationDate) {
                const creationDate = new Date(config.CreationDate);

                if (creationDate > thirtyDaysAgo) {
                    last30Days++;
                }

                if (creationDate > ninetyDaysAgo) {
                    recentAMIs++;
                } else if (creationDate <= ninetyDaysAgo && creationDate > oneEightyDaysAgo) {
                    oldAMIs++;
                } else {
                    veryOldAMIs++;
                }
            }
        }

        const summaries = [
            { title: 'Total AMIs', value: totalAMIs.toLocaleString() },
            { title: 'AMIs < 30 days old', value: last30Days.toLocaleString() },
            { title: 'AMIs < 90 days old', value: recentAMIs.toLocaleString() },
            { title: 'AMIs 90-180 days old', value: oldAMIs.toLocaleString() },
            { title: 'AMIs > 180 days old', value: veryOldAMIs.toLocaleString() }
        ];

        return summaries;
    }

    async getKeyDetail(req, year, month, day) {
        const amisCollection = req.collection("amis");

        const targetDate = new Date(year, month - 1, day);
        const ninetyDaysAgo = new Date(targetDate);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const amisCursor = await amisCollection.find({
            year: year,
            month: month,
            day: day
        });

        let totalAMIs = 0;
        let oldAMIsCount = 0;

        for await (const doc of amisCursor) {
            totalAMIs++;

            const config = doc.Configuration || {};
            if (config.CreationDate) {
                const creationDate = new Date(config.CreationDate);
                if (creationDate <= ninetyDaysAgo) {
                    oldAMIsCount++;
                }
            }
        }

        if (totalAMIs === 0) {
            return 'No AMIs found';
        }

        if (oldAMIsCount === 0) {
            return `All ${totalAMIs.toLocaleString()} AMIs are less than 90 days old`;
        }

        return `${oldAMIsCount.toLocaleString()} of ${totalAMIs.toLocaleString()} AMIs are older than 90 days`;
    }
}

module.exports = OldAMIsMetric;