import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const { data, error } = await supabase.from('products').select('*').limit(1)
    if (error) {
        console.error(error)
    } else {
        console.log("Product Columns:", Object.keys(data[0] || {}).join(", "))
        console.log("Sample Data:", data[0])
    }
}

run()
