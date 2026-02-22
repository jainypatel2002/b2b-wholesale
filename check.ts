import fs from 'fs'
const s = fs.readFileSync('.env.local', 'utf-8').match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim()
const k = fs.readFileSync('.env.local', 'utf-8').match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim()
fetch(`${s}/rest/v1/distributor_vendors?select=*&limit=1`, { headers: { 'apikey': k, 'Authorization': `Bearer ${k}` }}).then(r => r.json()).then(data => console.log('distributor_vendors:', data))

fetch(`${s}/rest/v1/vendor_distributor_links?select=*&limit=1`, { headers: { 'apikey': k, 'Authorization': `Bearer ${k}` }}).then(r => r.json()).then(data => console.log('vendor_distributor_links:', data)).catch(e => console.log('err', e.message))
