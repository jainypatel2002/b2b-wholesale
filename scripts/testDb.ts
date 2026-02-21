import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

async function run() {
    console.log("Checking subcategory_products...");
    const { data, error } = await supabase.from('subcategory_products').select('*').limit(1)
    console.log("Data:", data, "Error:", error)

    console.log("Checking subcategories...");
    const res2 = await supabase.from('subcategories').select('*').limit(1)
    console.log("Data:", res2.data, "Error:", res2.error)

    console.log("Checking category_nodes...");
    const res3 = await supabase.from('category_nodes').select('*').limit(1)
    console.log("Data:", res3.data, "Error:", res3.error)
}
run()
