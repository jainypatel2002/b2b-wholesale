import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function check() {
  const { data, error } = await supabase.from('distributor_vendors').select('*').limit(1)
  console.log('Error dv:', error?.message)
  console.log('Data dv:', data)
  const { data: vdl, error: e1 } = await supabase.from('vendor_distributor_links').select('*').limit(1)
  console.log('Error vdl:', e1?.message)
}
check()
