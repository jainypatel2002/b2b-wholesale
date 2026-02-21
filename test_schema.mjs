import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const envRaw = fs.readFileSync('.env.local', 'utf8')
let url, key;
envRaw.split('\n').forEach(line => {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1]
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1]
})

const supabase = createClient(url, key)

async function test() {
    const { data, error } = await supabase.from('categories').select('is_active').limit(1)
    if (error) {
        console.log("SCHEMA ERROR:", error.message)
    } else {
        console.log("SCHEMA OK. Column 'is_active' exists!")
    }
}
test()
