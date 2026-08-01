import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

// Next.js 16: the `middleware` file convention was renamed to `proxy`,
// and the file must sit at the same level as `app` (inside src/). There must
// be exactly one of the two — shipping a `middleware.ts` alongside this file
// makes every route 404.

/**
 * Correlation id for a request.
 *
 * Reused from the inbound header when a proxy already set one (Azure Container
 * Apps does), so our id matches what the platform logged; otherwise minted.
 *
 * The inbound value is attacker-controlled on a public endpoint and ends up in
 * JSON log lines, so it is accepted only if it is id-shaped and short — that
 * stops a crafted header injecting newlines and forging log entries.
 */
function resolveRequestId(request: NextRequest): string {
  const incoming = request.headers.get('x-request-id');
  return incoming && /^[A-Za-z0-9._-]{1,64}$/.test(incoming) ? incoming : crypto.randomUUID();
}

export async function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request);

  // Every handler and server component should see the id, so thread it onto
  // the forwarded request headers rather than only onto the response.
  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);

  // API routes take the cheap path. The session refresh below costs a Supabase
  // round trip, and paying that on every /api/* call — which already
  // authenticates itself from its own Bearer token — would add latency to
  // every request in the app for no benefit.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const res = NextResponse.next({ request: { headers } });
    res.headers.set('x-request-id', requestId);
    return res;
  }

  const res = await updateSession(request, headers);
  res.headers.set('x-request-id', requestId);
  return res;
}

async function updateSession(request: NextRequest, headers: Headers) {
  let supabaseResponse = NextResponse.next({ request: { headers } });

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
          supabaseResponse = NextResponse.next({ request: { headers } });
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
  // `api/` is now INCLUDED so API responses carry `x-request-id` — that header
  // is what links a tester's error screenshot to a Sentry event and a log line.
  // proxy() short-circuits for those paths before any Supabase work, so they
  // pay only a header copy.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
