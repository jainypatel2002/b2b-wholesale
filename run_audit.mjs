import pg from 'pg';
const { Client } = pg;
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
});

async function main() {
    await client.connect();

    console.log("--- 1. List actual columns and types ---");
    const q1 = `
    select table_name, column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema='public'
    and table_name in (
      'products', 'vendor_price_overrides', 'bulk_pricing',
      'orders','order_items', 'invoices','invoice_items',
      'categories','product_categories'
    )
    order by table_name, ordinal_position;
    `;
    const res1 = await client.query(q1);
    fs.writeFileSync('audit_cols.json', JSON.stringify(res1.rows, null, 2));

    console.log("--- 2. List constraints ---");
    const q2 = `
    select t.relname as table_name, c.conname, pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    join pg_class t on c.conrelid=t.oid
    where t.relname in ('products','vendor_price_overrides','bulk_pricing','order_items','invoice_items','invoices')
    order by t.relname, c.conname;
    `;
    const res2 = await client.query(q2);
    fs.writeFileSync('audit_constraints.json', JSON.stringify(res2.rows, null, 2));

    console.log("--- 3. Check RLS + policies ---");
    const q3a = `
    select schemaname, tablename, rowsecurity
    from pg_tables
    where schemaname='public'
    and tablename in ('vendor_price_overrides','bulk_pricing','products','order_items','invoice_items','invoices');
    `;
    const res3a = await client.query(q3a);

    const q3b = `
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname='public'
    and tablename in ('vendor_price_overrides','bulk_pricing','products','order_items','invoice_items','invoices')
    order by tablename, policyname;
    `;
    const res3b = await client.query(q3b);
    fs.writeFileSync('audit_rls.json', JSON.stringify({ tables: res3a.rows, policies: res3b.rows }, null, 2));

    console.log("Done logging to json files.");
    await client.end();
}

main().catch(console.error);
