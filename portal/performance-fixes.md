# MongoDB Performance Fixes for Cloud Advice Dashboard

## 1. Update MongoDB Connection (CRITICAL)

Replace `/portal/libs/middleware/mongo.js` with the optimized version that includes:
- Connection pooling (10-100 connections)
- Proper timeouts
- Index creation on startup

## 2. Add Query Optimizations

### For All Dashboard Queries:

```javascript
// BAD - Current approach
const cursor = await collection.find({ year, month, day });
for await (const doc of cursor) {
  // Process each document
}

// GOOD - Optimized approach
const cursor = await collection.find(
  { year, month, day },
  {
    projection: { Tags: 1, Configuration: 1 }, // Only fetch needed fields
    limit: 10000,  // Add reasonable limit
    batchSize: 1000  // Process in batches
  }
).hint({ year: 1, month: 1, day: 1 }); // Force index usage
```

## 3. Use Aggregation Pipelines

For counting and statistics, use MongoDB aggregation instead of JavaScript loops:

```javascript
// Count compliant resources using aggregation
const pipeline = [
  { $match: { year, month, day } },
  { $project: { Tags: 1 } },  // Only fetch needed fields
  {
    $group: {
      _id: null,
      total: { $sum: 1 },
      compliant: {
        $sum: { $cond: [{ /* your condition */ }, 1, 0] }
      }
    }
  }
];

const result = await collection.aggregate(pipeline, {
  allowDiskUse: true,
  maxTimeMS: 30000
}).toArray();
```

## 4. Implement Caching

Add Redis or in-memory caching for dashboard metrics:

```javascript
const cache = new Map();
const CACHE_TTL = 60000; // 1 minute

async function getCachedMetrics(key, calculator) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }

  const data = await calculator();
  cache.set(key, { data, time: Date.now() });
  return data;
}
```

## 5. Parallel Query Optimization

The dashboard already runs metrics in parallel, but each metric re-queries the same collections. Consider pre-loading shared data:

```javascript
// Load shared data once
const [tagsData, elbData, rdsData] = await Promise.all([
  req.collection('tags').find({ year, month, day }, { projection: { Tags: 1 } }).toArray(),
  req.collection('elb_v2').find({ year, month, day }, { projection: { Configuration: 1 } }).toArray(),
  req.collection('rds').find({ year, month, day }, { projection: { Configuration: 1 } }).toArray()
]);

// Pass pre-loaded data to metrics
const metrics = await Promise.all(
  dashboardMetrics.map(m => m.calculate(req, year, month, day, { tagsData, elbData, rdsData }))
);
```

## 6. Database-Level Optimizations

Run these in MongoDB shell:

```javascript
// Check slow queries
db.setProfilingLevel(1, { slowms: 100 });

// Analyze query performance
db.tags.find({ year: 2025, month: 1, day: 29 }).explain("executionStats");

// Ensure read preference for secondaries (if using replica set)
db.getMongo().setReadPref("secondaryPreferred");
```

## 7. Quick Win - Add These Indexes NOW

```javascript
// Most critical indexes for your query patterns
db.tags.createIndex({ year: 1, month: 1, day: 1 }, { background: true });
db.elb_v2.createIndex({ year: 1, month: 1, day: 1 }, { background: true });
db.rds.createIndex({ year: 1, month: 1, day: 1 }, { background: true });
db.kms_keys.createIndex({ year: 1, month: 1, day: 1 }, { background: true });
db.ec2.createIndex({ year: 1, month: 1, day: 1 }, { background: true });
db.amis.createIndex({ year: 1, month: 1, day: 1 }, { background: true });

// For latest date queries
db.tags.createIndex({ year: -1, month: -1, day: -1 }, { background: true });
```

## 8. Monitor Performance

Add timing logs to identify slow queries:

```javascript
const start = Date.now();
const result = await collection.find({ year, month, day }).toArray();
console.log(`Query took ${Date.now() - start}ms for ${result.length} documents`);
```

## Expected Performance Improvements

With these changes:
- Connection pooling: 50-70% faster response times
- Query projections: 30-50% less memory usage
- Index hints: 10-100x faster queries
- Aggregation pipelines: 5-10x faster counting
- Caching: Near-instant responses for repeated requests

## Testing the Fixes

1. Apply the connection pooling fix first (biggest impact)
2. Add indexes if not already present
3. Update one metric to use aggregation
4. Compare before/after performance
5. Roll out to all metrics if successful