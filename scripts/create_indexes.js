// MongoDB Index Creation Script for Cloud Advice Dashboard
// Run with: mongo <database_name> create_indexes.js

print("Creating indexes for Cloud Advice Dashboard...");

const collections = [
    'tags', 'elb_v2', 'elb_v2_listeners', 'elb_v2_target_groups',
    'elb_classic', 'rds', 'redshift_clusters', 'kms_key_metadata',
    'kms_keys', 'autoscaling_groups', 'amis', 'ec2'
];

// 1. Primary date-based query index (ascending)
collections.forEach(function(coll) {
    print(`Creating date index for ${coll}...`);
    db[coll].createIndex({ year: 1, month: 1, day: 1 });
});

// 2. Latest date query index (descending) for collections that need it
const latestDateCollections = ['tags', 'elb_v2', 'rds', 'kms_keys'];
latestDateCollections.forEach(function(coll) {
    print(`Creating latest date index for ${coll}...`);
    db[coll].createIndex({ year: -1, month: -1, day: -1 });
});

// 3. Account-based query indexes
const accountCollections = ['tags', 'elb_v2', 'elb_v2_listeners', 'rds', 'kms_key_metadata'];
accountCollections.forEach(function(coll) {
    print(`Creating account index for ${coll}...`);
    db[coll].createIndex({ account_id: 1 });
});

// 4. Compound indexes for date + account queries
const compoundCollections = ['tags', 'elb_v2'];
compoundCollections.forEach(function(coll) {
    print(`Creating compound date+account index for ${coll}...`);
    db[coll].createIndex({ year: 1, month: 1, day: 1, account_id: 1 });
});

// 5. Unique constraint index (prevents duplicate resources)
collections.forEach(function(coll) {
    print(`Creating unique constraint index for ${coll}...`);
    db[coll].createIndex(
        { year: 1, month: 1, day: 1, account_id: 1, resource_id: 1 },
        { unique: true }
    );
});

// 6. Resource type index for tags collection
print("Creating resource_type index for tags...");
db.tags.createIndex({ resource_type: 1 });

print("\nIndex creation complete!");
print("\nTo verify indexes, run:");
collections.forEach(function(coll) {
    print(`db.${coll}.getIndexes()`);
});

print("\nTo check index usage for a query, run:");
print("db.collection.find({ year: 2025, month: 1, day: 1 }).explain('executionStats')");