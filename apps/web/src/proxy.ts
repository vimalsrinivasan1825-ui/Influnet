import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

// Next.js 16: the `middleware` file convention was renamed to `proxy`,
// and the file must sit at the same level as `app` (inside src/).
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Only /dashboard/* actually requires a session at the middleware layer —
  // every other real route (/, /login, /signup/*, /<username>, /vf/*,
  // /reset-password, /influnet, /ui-preview) is either public or does its own
  // server-side auth check (the business branch of /[username] redirects to
  // login itself when it needs to). Note that public profiles now sit at the
  // ROOT, so an unmatched path is a username lookup before it is a 404 — which
  // is exactly why nothing here may assume unknown paths are protected. This
  // used to gate on an explicit public-path allowlist and
  // send EVERYTHING else to /login, which meant a typo'd or nonexistent URL
  // (anonymous or not) was indistinguishable from a real protected page —
  // masking genuine 404s as a login prompt. Gating on the one prefix that's
  // actually protected lets an unmatched path fall through to Next's normal
  // routing, which 404s it for real.
  const requiresAuth = pathname === '/dashboard' || pathname.startsWith('/dashboard/');

  if (!user && requiresAuth) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
