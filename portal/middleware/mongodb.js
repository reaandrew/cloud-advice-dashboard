const { MongoClient } = require('mongodb');

const mongoHost = process.env.MONGO_HOST;
const mongoPort = process.env.MONGO_PORT;
const uri = `mongodb://${mongoHost ?? "localhost"}:${mongoPort ?? "27017"}`;
const dbName = 'aws_data';

// Middleware to provide MongoDB connection
const mongoConnection = async (req, res, next) => {
    const client = new MongoClient(uri);
    
    try {
        await client.connect();
        
        // Attach client and db to request object
        req.mongoClient = client;
        req.db = client.db(dbName);
        
        // Ensure cleanup happens after response
        res.on('finish', async () => {
            try {
                await client.close();
            } catch (err) {
                console.error('Error closing MongoDB connection:', err);
            }
        });
        
        next();
    } catch (err) {
        console.error('MongoDB connection error:', err);
        try {
            await client.close();
        } catch (closeErr) {
            console.error('Error closing failed MongoDB connection:', closeErr);
        }
        res.status(500).send('Database connection error');
    }
};

module.exports = mongoConnection;