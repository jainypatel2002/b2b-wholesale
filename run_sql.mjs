import pkg from 'pg';
const { Client } = pkg;
import * as fs from 'fs';

const envRaw = fs.readFileSync('.env.local', 'utf8');
let connString;
envRaw.split('\n').forEach(line => {
    if (line.startsWith('DATABASE_URL=')) connString = line.split('=')[1].replace(/"/g, '').trim();
});

if (!connString) {
    console.error("No DATABASE_URL found in .env.local. Cannot apply migrations via pg directly.");
    process.exit(1);
}

const client = new Client({
    connectionString: connString,
    ssl: { rejectUnauthorized: false }
});

async function applyMigration() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error("Please provide a SQL file path.");
        process.exit(1);
    }

    console.log(`Applying script from: ${filePath}`);
    const sql = fs.readFileSync(filePath, 'utf8');

    try {
        await client.connect();
        await client.query(sql);
        console.log(`✅ Success: ${filePath}`);
    } catch (err) {
        console.error(`❌ Failed: ${filePath}`);
        console.error(err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

applyMigration();
