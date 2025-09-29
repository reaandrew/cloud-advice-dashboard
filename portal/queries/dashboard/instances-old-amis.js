const DashboardMetric = require('./base');

class InstancesWithOldAMIsMetric extends DashboardMetric {
    constructor() {
        super({
            id: 'instances-old-amis',
            title: 'Instances with Current AMIs',
            description: 'EC2 instances using AMIs less than 90 days old',
            category: 'infrastructure',
            order: 11,
            colorScheme: 'success'
        });
    }

    async calculate(req, year, month, day) {
        const instancesCollection = req.collection("ec2");
        const amisCollection = req.collection("amis");

        const targetDate = new Date(year, month - 1, day);
        const ninetyDaysAgo = new Date(targetDate);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const amiMap = new Map();
        const amisCursor = await amisCollection.find({
            year: year,
            month: month,
            day: day
        });

        for await (const ami of amisCursor) {
            const config = ami.Configuration || {};
            if (config.ImageId && config.CreationDate) {
                const creationDate = new Date(config.CreationDate);
                amiMap.set(config.ImageId, {
                    creationDate: creationDate,
                    isOld: creationDate <= ninetyDaysAgo
                });
            }
        }

        const instancesCursor = await instancesCollection.find({
            year: year,
            month: month,
            day: day
        });

        let totalInstances = 0;
        let instancesWithCurrentAMIs = 0;
        let instancesWithUnknownAMIs = 0;

        for await (const instance of instancesCursor) {
            const config = instance.Configuration || {};
            if (config.State && config.State.Name === 'running') {
                totalInstances++;

                if (config.ImageId) {
                    const amiInfo = amiMap.get(config.ImageId);
                    if (amiInfo) {
                        if (!amiInfo.isOld) {
                            instancesWithCurrentAMIs++;
                        }
                    } else {
                        instancesWithUnknownAMIs++;
                    }
                }
            }
        }

        if (totalInstances === 0) {
            return 'N/A';
        }

        const instancesWithOldAMIs = totalInstances - instancesWithCurrentAMIs - instancesWithUnknownAMIs;
        if (instancesWithOldAMIs === 0 && instancesWithUnknownAMIs === 0) {
            return 100;
        }

        return Math.round((instancesWithCurrentAMIs / totalInstances) * 100);
    }

    async getSummaries(req, year, month, day) {
        const instancesCollection = req.collection("ec2");
        const amisCollection = req.collection("amis");

        const targetDate = new Date(year, month - 1, day);
        const ninetyDaysAgo = new Date(targetDate);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const oneEightyDaysAgo = new Date(targetDate);
        oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);

        const amiMap = new Map();
        const amisCursor = await amisCollection.find({
            year: year,
            month: month,
            day: day
        });

        for await (const ami of amisCursor) {
            if (ami.ImageId && ami.CreationDate) {
                const creationDate = new Date(ami.CreationDate);
                let ageCategory = 'current';

                if (creationDate <= oneEightyDaysAgo) {
                    ageCategory = 'very-old';
                } else if (creationDate <= ninetyDaysAgo) {
                    ageCategory = 'old';
                }

                amiMap.set(ami.ImageId, {
                    creationDate: creationDate,
                    ageCategory: ageCategory
                });
            }
        }

        const instancesCursor = await instancesCollection.find({
            year: year,
            month: month,
            day: day
        });

        let totalInstances = 0;
        let runningInstances = 0;
        let instancesWithCurrentAMIs = 0;
        let instancesWithOldAMIs = 0;
        let instancesWithVeryOldAMIs = 0;
        let instancesWithUnknownAMIs = 0;

        for await (const instance of instancesCursor) {
            totalInstances++;

            if (instance.State && instance.State.Name === 'running') {
                runningInstances++;

                if (config.ImageId) {
                    const amiInfo = amiMap.get(config.ImageId);
                    if (amiInfo) {
                        switch (amiInfo.ageCategory) {
                            case 'current':
                                instancesWithCurrentAMIs++;
                                break;
                            case 'old':
                                instancesWithOldAMIs++;
                                break;
                            case 'very-old':
                                instancesWithVeryOldAMIs++;
                                break;
                        }
                    } else {
                        instancesWithUnknownAMIs++;
                    }
                }
            }
        }

        const summaries = [
            { title: 'Total EC2 Instances', value: totalInstances.toLocaleString() },
            { title: 'Running Instances', value: runningInstances.toLocaleString() },
            { title: 'Instances with AMIs < 90 days old', value: instancesWithCurrentAMIs.toLocaleString() },
            { title: 'Instances with AMIs 90-180 days old', value: instancesWithOldAMIs.toLocaleString() },
            { title: 'Instances with AMIs > 180 days old', value: instancesWithVeryOldAMIs.toLocaleString() }
        ];

        if (instancesWithUnknownAMIs > 0) {
            summaries.push({
                title: 'Instances with unknown AMI age',
                value: instancesWithUnknownAMIs.toLocaleString()
            });
        }

        return summaries;
    }

    async getKeyDetail(req, year, month, day) {
        const instancesCollection = req.collection("ec2");
        const amisCollection = req.collection("amis");

        const targetDate = new Date(year, month - 1, day);
        const ninetyDaysAgo = new Date(targetDate);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const amiMap = new Map();
        const amisCursor = await amisCollection.find({
            year: year,
            month: month,
            day: day
        });

        for await (const ami of amisCursor) {
            const config = ami.Configuration || {};
            if (config.ImageId && config.CreationDate) {
                const creationDate = new Date(config.CreationDate);
                amiMap.set(config.ImageId, {
                    creationDate: creationDate,
                    isOld: creationDate <= ninetyDaysAgo
                });
            }
        }

        const instancesCursor = await instancesCollection.find({
            year: year,
            month: month,
            day: day
        });

        let runningInstances = 0;
        let instancesWithOldAMIs = 0;

        for await (const instance of instancesCursor) {
            if (instance.State && instance.State.Name === 'running') {
                runningInstances++;

                if (config.ImageId) {
                    const amiInfo = amiMap.get(config.ImageId);
                    if (amiInfo && amiInfo.isOld) {
                        instancesWithOldAMIs++;
                    }
                }
            }
        }

        if (runningInstances === 0) {
            return 'No running instances found';
        }

        if (instancesWithOldAMIs === 0) {
            return `All ${runningInstances.toLocaleString()} running instances use current AMIs`;
        }

        return `${instancesWithOldAMIs.toLocaleString()} of ${runningInstances.toLocaleString()} running instances use AMIs older than 90 days`;
    }
}

module.exports = InstancesWithOldAMIsMetric;