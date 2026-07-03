import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types';

let clientInstance: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (clientInstance) return clientInstance;

  clientInstance = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return clientInstance;
}
