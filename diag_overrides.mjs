import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

async function checkOverrides() {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    // Auth bypass just to inspect the table schema / RPCs if possible using REST
    const { data: rows, error } = await supabase.from('vendor_price_overrides').select('*').limit(5);
    fs.writeFileSync('diag_overrides.json', JSON.stringify({ rows, error }, null, 2));
}

checkOverrides().catch(console.error);
