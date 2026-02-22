const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
const s = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const k = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

fetch(`${s}/rest/v1/products?select=*&limit=1`, {
  headers: { apikey: k, Authorization: `Bearer ${k}` }
})
.then(r => r.json())
.then(d => console.log(JSON.stringify(d, null, 2)))
.catch(e => console.error(e));
