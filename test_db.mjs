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
  const { data, error } = await supabase.from('categories').select('id, name, is_active').limit(1)
  console.log("Categories test:", error ? "ERROR: " + error.message : "OK. is_active exists: " + ('is_active' in (data[0] || {})))
}
test()
