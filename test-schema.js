const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'apps/web/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data, error } = await supabase.from('profiles').select('*').limit(1);
  if (data) console.log("keys:", Object.keys(data[0] || {}));
  if (error) console.log("error:", error);
}
run();
