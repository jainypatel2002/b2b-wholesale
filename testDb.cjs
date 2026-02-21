const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0]] = parts.slice(1).join('=');
    }
});

const url = env['NEXT_PUBLIC_SUPABASE_URL'];
const key = env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

async function checkTable(tableName) {
    const res = await fetch(`${url}/rest/v1/${tableName}?select=*&limit=5`, {
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        }
    });
    console.log(`Table ${tableName}: Status ${res.status}`);
    if (res.status === 200) {
        const data = await res.json();
        console.log(`Contents:`, data);
    } else {
        const err = await res.text();
        console.log(`Error:`, err);
    }
}

async function run() {
    await checkTable('products');
    await checkTable('subcategories');
    await checkTable('categories');
    await checkTable('category_nodes');
}
run();
