const databasesView = {
    id: "databases",
    name: "Databases (RDS/Redshift)",
    collection: "rds",
    pipeline: [
        {$project: {
            _id: 0,
            account_id: 1,
            "ARN": "$Configuration.DBInstanceArn",
            "Id": "$Configuration.DBInstanceIdentifier",
            "Name": "$Configuration.DBName",
            "Status": "$Configuration.DBInstanceStatus",
            "Class": {$reduce: {
                input: "$Configuration.DBInstanceClass",
                initialValue: "",
                in: {$concat: ["$$this", " "]},
            }},
            "Engine": "$Configuration.Engine",
            "Version": "$Configuration.EngineVersion",
            "Availability Zone": "$Configuration.AvailabilityZone",
            "Creation Date": "$Configuration.InstanceCreateTime",
            "Tags": {$reduce: { // TODO: Update tags and all fields with the API spec for the synthetic data.
                input: "$Configuration.TagList",
                initialValue: "",
                in: {$concat: ["$$this.Key", "=", "$$this.Value", " "]},
            }},
        }},
        {$unionWith: {
            coll: "redshift_clusters",
            pipeline: [{$project: {
                _id: 0,
                account_id: 1,
                "ARN": "unknown",
                "Id": "$Configuration.ClusterIdentifier",
                "Name": "$Configuration.ClusterIdentifier",
                "Status": "unknown", // Some unknown items can be collected via alternative apis.
                "Class": "unknown",
                "Engine": "redshift",
                "Version": "$Configuration.ClusterVersion", // TODO: Issue here to fix. Cluster verison is a different AWS API call. Redshift version not stored in data.
                "Availability Zone": "unknown",
                "Creation Date": "unknown",
                "Tags": {$reduce: {
                    input: "$Configuration.TagKeys",
                    initialValue: "",
                        in: { $concat: ["$$this.Key", "=", "$$this.Value", " "] }
                }}
            }}]
        }}
    ],
    idField: "Id",
    prominentFields: ["Engine", "Version"],
    filterableFields: [
        { name: "Version", idSelector: "Version"},
        { name: "Status", idSelector: "Status"},
        { name: "Engine", idSelector: "Engine"},
    ],
    searchableFields: ["Version", "Status", "Name", "Id", "Tags"],
    detailsFields: ["Status", "Class", "Availability Zone", "Creation Date", "Tags"],
};

// TODO: Mark deprecated versions
const databaseVersionsRule = {
    id: "DATABASE1",
    name: "Database Versions",
    description: "Database Versions (RDS/Redshift)",
    view: databasesView.id,
    pipeline: (groupKey) => [
        {$group: {
            _id: {
                key: `$${groupKey}`,
                engine: "$Engine",
                version: "$Version",
            },
            count: { $count: {} },
        }},
        {$group: {
            _id :  "$_id.key",
            rows: {
                $push: {
                    "Engine": "$_id.engine",
                    "Version": "$_id.version",
                    Count: {$sum: "$count"}
                }
            }
        }}
    ],
    header: ["Engine", "Version", "Count"],
    links: [{
        field: "Count",
        forward: ["Engine", "Version"],
        view: databasesView.id,
    }],
}

module.exports = {
    databasesView,
    databaseVersionsRule,
}
