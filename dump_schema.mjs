import pkg from 'pg';
const { Client } = pkg;
import * as fs from 'fs';

const envRaw = fs.readFileSync('.env.local', 'utf8');
let connString;
envRaw.split('\n').forEach(line => {
    if (line.startsWith('DATABASE_URL=')) connString = line.split('=')[1].replace(/"/g, '').trim();
});

const client = new Client({
    connectionString: connString,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    await client.connect();

    console.log('--- TABLES & COLUMNS ---');
    const q1 = await client.query(`select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name in ('products','vendor_price_overrides','bulk_pricing','orders','order_items','invoices','invoice_items','categories','product_categories') order by table_name, ordinal_position;`);
    console.table(q1.rows);

    console.log('\n--- CONSTRAINTS ---');
    const q2 = await client.query(`select t.relname as table, c.conname as constraint_name, pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_class t on c.conrelid=t.oid where t.relname in ('products','vendor_price_overrides','bulk_pricing','order_items','invoice_items');`);
    console.table(q2.rows);

    await client.end();
}

run();
