import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'
// actually, let's just use the postgres connection strings or simply use REST? REST doesn't allow executing arbitrary DDL SQL unless through RPC. So Deno/Node cannot run DDL without postgres connection string.
