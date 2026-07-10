import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null;

export function createServerClient() {
  if (supabaseInstance) return supabaseInstance;

  supabaseInstance = createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseInstance;
}
