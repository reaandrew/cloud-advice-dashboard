/**
 * Mock MongoDB middleware for local development
 * Provides mock collections and functions that mimic MongoDB behavior
 */

const { mockRdsInstances, mockRedshiftClusters } = require('../../mock/database-data');
const { getDetailsForAllAccounts } = require('../../mock/account-data');

// Mock collection data
const collections = {
  'rds': mockRdsInstances,
  'redshift_clusters': mockRedshiftClusters,
  // Add other collections as needed
};

/**
 * Create a mock MongoDB middleware
 */
function mongoMock(req, res, next) {
  // Use a proper logger for consistent output
  const logger = require('../logger');

  // Log with debug level instead of using console directly
  logger.info('Using mock MongoDB middleware');
  logger.debug(`Mock collections available: ${Object.keys(collections).join(', ')}`);

  // Create a mock MongoDB client
  req.app.locals.mongodb = {
    // Mock methods can be added here as needed
    listCollections: () => {
      return {
        toArray: async () => Object.keys(collections).map(name => ({ name }))
      };
    }
  };

  // Add a collection method to the request object
  req.collection = (name) => {
    logger.debug(`Mock accessing collection: ${name}`);

    // Check if we have mock data for this collection
    if (!collections[name]) {
      logger.warn(`No mock data for collection "${name}"`);
      collections[name] = []; // Create empty collection
    }

    return {
      // Mock find method
      find: (filter = {}, options = {}) => {
        console.log(`Mock find on collection "${name}" with filter:`, filter);

        // Filter the mock data
        let results = [...collections[name]];

        // Apply year, month, day filter if present
        if (filter.year && filter.month && filter.day) {
          results = results.filter(doc =>
            doc.year === filter.year &&
            doc.month === filter.month &&
            doc.day === filter.day
          );
        }

        // Create cursor-like object
        return {
          // Make the cursor async iterable
          [Symbol.asyncIterator]: async function* () {
            for (const doc of results) {
              yield doc;
            }
          },
          // Add toArray method
          toArray: async () => results
        };
      },

      // Mock findOne method
      findOne: async (filter = {}, options = {}) => {
        console.log(`Mock findOne on collection "${name}" with filter:`, filter);

        // Get all documents in the collection
        const docs = collections[name];

        // If empty, return null
        if (!docs || docs.length === 0) {
          return null;
        }

        // For finding latest date, return the first document
        if (Object.keys(filter).length === 0 && options.projection &&
            options.projection.year && options.projection.month && options.projection.day) {
          if (docs.length > 0) {
            const doc = docs[0];
            // Filter projection fields
            const result = {};
            for (const key of Object.keys(options.projection)) {
              result[key] = doc[key];
            }
            return result;
          }
          return null;
        }

        // Default to returning the first document
        return docs[0] || null;
      }
    };
  };

  // Add getDetailsForAllAccounts to the request
  req.getDetailsForAllAccounts = getDetailsForAllAccounts;

  next();
}

module.exports = mongoMock;