import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_PROJECT_REF = SUPABASE_URL?.replace('https://', '').split('.')[0] ?? '';
const ADMIN_EMAIL = 'admin@influnet.com';
const ADMIN_PASSWORD = 'Admin@123';

/**
 * Run SQL directly via Supabase Management API query endpoint.
 * Uses SUPABASE_ACCESS_TOKEN (Personal Access Token) for auth.
 */
async function runSql(sql: string): Promise<any> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    throw new Error('SUPABASE_ACCESS_TOKEN not set in .env.local');
  }

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API error: ${text}`);
  }

  return res.json();
}

export async function POST() {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  if (!SUPABASE_URL) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_URL not set' }, { status: 500 });
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_ANON_KEY not set' }, { status: 500 });
  }

  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({
      success: false,
      error: 'SUPABASE_ACCESS_TOKEN not set',
      message: 'Add the token to .env.local as SUPABASE_ACCESS_TOKEN=sbp_...'
    }, { status: 400 });
  }

  try {
    // Step 1: Check if user already exists (check both auth.users and public.profiles)
    const [existingInAuth, existingInProfiles]: any = await Promise.all([
      runSql(`SELECT id, email FROM auth.users WHERE email = '${ADMIN_EMAIL}' LIMIT 1;`),
      runSql(`SELECT id, email FROM public.profiles WHERE email = '${ADMIN_EMAIL}' LIMIT 1;`),
    ]);

    let userId: string;

    if (existingInAuth && existingInAuth.length > 0) {
      // Auth user exists — use their ID
      userId = existingInAuth[0].id;

      if (existingInProfiles && existingInProfiles.length > 0) {
        // Profile exists too — just promote to admin
        await runSql(
          `UPDATE public.profiles SET role = 'admin', updated_at = now() WHERE id = '${userId}';`
        );
      } else {
        // Auth exists but profile doesn't — create profile + confirm email
        const now = new Date().toISOString();
        await runSql(
          `INSERT INTO public.profiles (id, role, email, name, created_at, updated_at)
           VALUES ('${userId}', 'admin', '${ADMIN_EMAIL}', 'Admin', '${now}', '${now}')
           ON CONFLICT (id) DO UPDATE SET role = 'admin', name = 'Admin', updated_at = '${now}';`
        );
        await runSql(
          `UPDATE auth.users SET email_confirmed_at = '${now}', confirmed_at = '${now}' WHERE id = '${userId}';`
        );
      }
    } else {
      // Step 2: Sign up the user via regular auth (uses anon key — always works)
      const supabase = createClient(SUPABASE_URL, anonKey);

      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        options: {
          data: { role: 'admin' },
        },
      });

      if (signUpError) {
        return NextResponse.json({ success: false, error: signUpError.message }, { status: 500 });
      }

      if (!authData.user?.id) {
        return NextResponse.json({ success: false, error: 'Sign up returned no user' }, { status: 500 });
      }

      userId = authData.user.id;

      // Step 3: Insert the profile with admin role via Management API
      const now = new Date().toISOString();
      await runSql(
        `INSERT INTO public.profiles (id, role, email, name, created_at, updated_at)
         VALUES ('${userId}', 'admin', '${ADMIN_EMAIL}', 'Admin', '${now}', '${now}')
         ON CONFLICT (id) DO UPDATE SET role = 'admin', name = 'Admin', updated_at = '${now}';`
      );

      // Step 4: Confirm the user's email so they can log in immediately
      await runSql(
        `UPDATE auth.users SET email_confirmed_at = '${now}', confirmed_at = '${now}' WHERE id = '${userId}';`
      );
    }

    return NextResponse.json({
      success: true,
      message: existingInAuth && existingInAuth.length > 0
        ? 'Existing user promoted to admin!'
        : 'Admin user created successfully!',
      credentials: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
      loginUrl: '/login',
    });

  } catch (error: any) {
    console.error('[Admin Seed] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
