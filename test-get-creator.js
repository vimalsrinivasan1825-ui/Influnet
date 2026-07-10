const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'apps/web/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data, error } = await supabase.rpc('get_public_influencer', { p_slug: 'vimal2123' });
  console.log("influencer:", data, error);
  
  const { data: bData, error: bError } = await supabase.rpc('get_public_business', { p_slug: 'vimal2123' });
  console.log("business:", bData, bError);
}
run();
