const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config({ path: './config.env' });

const client = new MongoClient(process.env.ATLAS_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let database;

module.exports = {
    connectToServer: async () => {
        try {
            await client.connect();
            database = client.db("ems_enterprise");
            console.log("✅ Connected to MongoDB Atlas → ems_enterprise");
        } catch (err) {
            console.error("❌ MongoDB connection failed:", err.message);
            process.exit(1);
        }
    },
    getDb: () => {
        if (!database) throw new Error("Database not initialized. Call connectToServer() first.");
        return database;
    }
};
