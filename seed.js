require('dotenv').config({ path: './config.env' });
const { MongoClient, ServerApiVersion } = require('mongodb');
const { seedDatabase } = require('./services/seedService');

const ATLAS_URI = process.env.ATLAS_URI;
const client = new MongoClient(ATLAS_URI, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } });

const seed = async () => {
    await client.connect();
    const database = client.db('ems_enterprise');
    console.log('✅ Connected to ems_enterprise');

    await seedDatabase(database, { reset: true });

    console.log('\n🎉 Seed complete!\n');
    console.log('Login Credentials:');
    console.log('  SuperAdmin : admin@ems.com   / Admin@12345');
    console.log('  HR Manager : hr@ems.com      / HR@123456');
    console.log('  Manager    : manager@ems.com / Manager@123');
    console.log('  Employee   : rahul@ems.com   / Emp@12345');

    await client.close();
    process.exit(0);
};

seed().catch((err) => { console.error('❌ Seed failed:', err); client.close(); process.exit(1); });
