import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

async function run() {
    const { data, error } = await supabase.rpc('get_tables', {}) // if they have it?

    if (error) {
        // Alternatively just query a known table and log the schema or use a raw sql execute if available
        console.log("RPC get_tables failed:", error)

        // Let's try to select from 'subcategory_products' to see if it exists
        const res = await supabase.from('subcategory_products').select('*').limit(1)
        console.log("Select subcategory_products:", res)

        // And subcategories
        const res2 = await supabase.from('subcategories').select('*').limit(1)
        console.log("Select subcategories:", res2)
    }
}
run()
