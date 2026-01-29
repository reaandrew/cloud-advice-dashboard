/**
 * Mock MongoDB middleware for local development
 * Provides mock collections and functions that mimic MongoDB behavior
 */

const { mockRdsInstances, mockRedshiftClusters } = require('../../mock/database-data');
const { mockElbV2, mockElbV2Listeners, mockElbClassic, mockElbV2TargetGroups } = require('../../mock/loadbalancer-data');
const { mockTags, mockKmsKeys, mockKmsKeyMetadata, mockAutoscalingGroups } = require('../../mock/compliance-data');
const { getDetailsForAllAccounts } = require('./getDetailsByAccountId');

// Mock collection data
const collections = {
  'rds': mockRdsInstances,
  'redshift_clusters': mockRedshiftClusters,
  'elb_v2': mockElbV2,
  'elb_v2_listeners': mockElbV2Listeners,
  'elb_classic': mockElbClassic,
  'elb_v2_target_groups': mockElbV2TargetGroups,
  'tags': mockTags,
  'kms_keys': mockKmsKeys,
  'kms_key_metadata': mockKmsKeyMetadata,
  'autoscaling_groups': mockAutoscalingGroups,
};

/**
 * Create a mock MongoDB middleware
 */
function mongoMock(req, res, next) {
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
    // Check if we have mock data for this collection
    if (!collections[name]) {
      collections[name] = []; // Create empty collection
    }

    return {
      // Mock find method
      find: (filter = {}, options = {}) => {
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

  // Add getDetailsForAllAccounts to the request (uses account_mappings from config)
  req.getDetailsForAllAccounts = async () => getDetailsForAllAccounts(null);

  next();
}

module.exports = mongoMock;
