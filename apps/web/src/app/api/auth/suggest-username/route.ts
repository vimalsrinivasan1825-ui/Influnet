import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { UsernameSchema } from '@/lib/validators';

export async function GET(req: Request) {
  const limited = await enforceRateLimit(req, {
    bucket: 'auth:suggest-username',
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const rawName = new URL(req.url).searchParams.get('name') ?? '';
  const name = rawName.trim().toLowerCase();
  
  if (name.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  // Generate some common permutations based on the name.
  // We use a Set to deduplicate, especially for single-word names.
  const base1 = name.replace(/[^a-z0-9]/g, '');
  const base2 = name.replace(/\\s+/g, '.').replace(/[^a-z0-9.]/g, '');
  const base3 = name.replace(/\\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  
  const candidates = Array.from(new Set([
    base1,
    base2,
    base3,
    `${base1}${Math.floor(Math.random() * 100)}`,
    `${base1}${new Date().getFullYear().toString().slice(2)}`,
  ])).filter(u => UsernameSchema.safeParse(u).success).slice(0, 5);

  if (candidates.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    // Call the RPC for each candidate in parallel.
    // This is cheap because they are simple index lookups.
    const checks = await Promise.all(
      candidates.map(async (u) => {
        const { data } = await supabase.rpc('check_username_available', { p_username: u });
        return { username: u, available: data === true };
      })
    );

    const available = checks.filter(c => c.available).map(c => c.username);
    
    // Return top 3 suggestions
    return NextResponse.json({ suggestions: available.slice(0, 3) });
  } catch (error) {
    return jsonError(500, 'Could not generate username suggestions', error);
  }
}
