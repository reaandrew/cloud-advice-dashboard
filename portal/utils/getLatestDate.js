/**
 * Utility function to get the latest date from a MongoDB collection
 * Optimized to only query current or previous month
 *
 * @param {Object} req - Express request object with collection method
 * @param {string} collectionName - Name of the MongoDB collection to query
 * @returns {Promise<Object|null>} - Latest date object with year, month, day or null
 */
async function getLatestDateForCollection(req, collectionName) {
    const collection = req.collection(collectionName);

    // Get current date to filter by current year and month
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed

    // First try current month
    let date = await collection.findOne({
        year: currentYear,
        month: currentMonth
    }, {
        projection: { year: 1, month: 1, day: 1 },
        sort: { day: -1 }  // Just sort by day since year/month are fixed
    });

    // If no data found in current month, fall back to previous month
    if (!date) {
        const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

        date = await collection.findOne({
            year: prevYear,
            month: prevMonth
        }, {
            projection: { year: 1, month: 1, day: 1 },
            sort: { day: -1 }
        });
    }

    return date;
}

/**
 * Get the latest date across multiple collections
 * Returns the most recent date found in any of the collections
 *
 * @param {Object} req - Express request object with collection method
 * @param {string[]} collectionNames - Array of collection names to check
 * @returns {Promise<Object|null>} - Latest date object or null
 */
async function getLatestDateAcrossCollections(req, collectionNames) {
    let latestDate = null;

    for (const collectionName of collectionNames) {
        try {
            const date = await getLatestDateForCollection(req, collectionName);

            if (date && (!latestDate ||
                date.year > latestDate.year ||
                (date.year === latestDate.year && date.month > latestDate.month) ||
                (date.year === latestDate.year && date.month === latestDate.month && date.day > latestDate.day))) {
                latestDate = date;
            }
        } catch (error) {
            console.error(`Error getting latest date from ${collectionName}:`, error);
        }
    }

    return latestDate;
}

module.exports = {
    getLatestDateForCollection,
    getLatestDateAcrossCollections
};