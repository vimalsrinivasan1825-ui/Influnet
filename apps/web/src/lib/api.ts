import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database, UserRole } from '@/types';

export function jsonError(status: number, publicMessage: string, error?: any) {
  if (error) {
    console.error(`[API Error ${status}] ${publicMessage}:`, error);
  } else {
    console.error(`[API Error ${status}] ${publicMessage}`);
  }
  return NextResponse.json({ error: publicMessage }, { status });
}

export async function withAuth(
  req: Request,
  opts?: { role?: UserRole }
): Promise<
  | { ok: true; supabase: any; user: User; role: UserRole }
  | { ok: false; res: NextResponse }
> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { ok: false, res: jsonError(401, 'Missing Authorization header') };
  }

  try {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { ok: false, res: jsonError(401, 'Unauthorized', userError) };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return { ok: false, res: jsonError(403, 'Profile not found', profileError) };
    }

    const userRole = profile.role as UserRole;

    if (opts?.role && userRole !== opts.role) {
      return { ok: false, res: jsonError(403, `Forbidden: Requires ${opts.role} role`) };
    }

    return { ok: true, supabase, user, role: userRole };
  } catch (error) {
    return { ok: false, res: jsonError(500, 'Internal server error', error) };
  }
}
