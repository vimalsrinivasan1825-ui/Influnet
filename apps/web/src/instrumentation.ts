/**
 * Next.js instrumentation hook — `register()` runs exactly once when a server
 * instance boots (before it accepts requests). We use it to print an
 * environment banner so every `npm run dev` / server start plainly states
 * WHICH environment and credentials it is running against.
 *
 * Guarded to the Node.js runtime so it prints once (not again for Edge).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { describeEnv } = await import('./lib/env');
  const info = describeEnv();

  // ── ANSI helpers (no dependency) ────────────────────────────────────────
  const C = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
  };
  const line = '━'.repeat(63);
  // Width follows the longest label rather than a fixed 13, so adding a row
  // with a longer name doesn't run its label straight into its value.
  const labelWidth = Math.max(13, ...info.rows.map((r) => r.label.length)) + 1;
  const label = (s: string) => s.padEnd(labelWidth);

  const envColor =
    info.appEnv === 'production'
      ? C.red
      : info.appEnv === 'staging'
        ? C.yellow
        : C.cyan;

  const out: string[] = [];
  out.push('');
  out.push(`${C.dim}${line}${C.reset}`);
  out.push(
    `  ${C.bold}Influnet${C.reset} · ${envColor}${C.bold}APP_ENV=${info.appEnv}${C.reset}` +
      `  ${C.dim}(NODE_ENV=${info.nodeEnv})${C.reset}`,
  );
  out.push(`${C.dim}${line}${C.reset}`);
  out.push(`  ${label('Env file')}${C.dim}${info.envFile}${C.reset}`);
  for (const row of info.rows) {
    const mark = row.ok ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
    out.push(`  ${label(row.label)}${row.value}  ${mark}`);
  }
  out.push(`${C.dim}${line}${C.reset}`);

  // Fail-fast: required vars missing → print banner, then throw a clear error.
  if (info.missingRequired.length > 0) {
    out.push(
      `  ${C.red}${C.bold}Missing required env vars:${C.reset} ${info.missingRequired.join(', ')}`,
    );
    out.push(
      `  ${C.dim}See apps/web/.env.example and your ${info.envFile} file.${C.reset}`,
    );
    out.push('');
    console.error(out.join('\n'));
    throw new Error(
      `Missing required environment variables: ${info.missingRequired.join(', ')}`,
    );
  }

  // Staging runs every feature flag ON, always — it's the always-current demo.
  // A `feature_flags` row (migration 137) explicitly set to `false` there is a
  // misconfiguration, not a decision, so refuse to boot rather than serve a
  // demo with a gate quietly open. A MISSING row or an unreadable table is
  // fine — that just falls back to the env var, which staging sets to `true`.
  if (info.appEnv === 'staging') {
    try {
      const { explicitlyDisabled } = await import('./lib/feature-flags');
      const off = await explicitlyDisabled();
      if (off.length > 0) {
        console.error(
          `\n${C.red}${C.bold}Refusing to start staging: feature flags disabled${C.reset}\n` +
            `  ${off.join(', ')} — staging must run every flag ON.\n` +
            `  Re-enable in the Supabase dashboard: ` +
            `update public.feature_flags set enabled = true where key = any(array[${off
              .map((k) => `'${k}'`)
              .join(', ')}]);\n`,
        );
        throw new Error(`staging: feature_flags disabled: ${off.join(', ')}`);
      }
    } catch (err) {
      // Only the guard's own throw should stop the boot. A failure to READ the
      // table (network, transient) must not — that path already falls back to
      // the env vars, and bricking staging over a blip is worse than the risk.
      if (err instanceof Error && err.message.startsWith('staging: feature_flags disabled')) {
        throw err;
      }
      console.warn('[instrumentation] staging feature-flag guard could not read feature_flags:', err);
    }
  }

  // Loud warning: running a dev server against PRODUCTION credentials.
  if (info.appEnv === 'production' && info.nodeEnv !== 'production') {
    out.push(
      `  ${C.red}${C.bold}⚠  You are running a DEV server against PRODUCTION credentials.${C.reset}`,
    );
    out.push(`${C.dim}${line}${C.reset}`);
  }

  out.push('');
  console.log(out.join('\n'));
}

/**
 * Next's error hook: fires for every uncaught server-side error — in a route
 * handler, a Server Component, or the framework itself.
 *
 * This is the piece that makes errors traceable without editing 65 route
 * files. `jsonError` already reports the faults it is given, but it only sees
 * errors a handler caught and converted; anything that throws past a handler,
 * or fails while rendering a page, previously produced a stack in stdout and
 * nothing else.
 *
 * The `x-request-id` middleware stamped on the request is attached here, so a
 * Sentry event, the request the user made, and the container log line all
 * carry the same id.
 */
export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string; headers?: Record<string, string | string[] | undefined> },
  context: { routerKind?: string; routePath?: string; routeType?: string },
) {
  try {
    const { captureException } = await import('./lib/observability');
    const { logger } = await import('./lib/logger');

    const rawId = request.headers?.['x-request-id'];
    const requestId = Array.isArray(rawId) ? rawId[0] : rawId;

    // The path can carry query params, and query params on this app carry
    // reset tokens and invite codes. Log and report the path only.
    const path = request.path?.split('?')[0];

    logger.error('unhandled server error', {
      err,
      path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
      requestId,
    });

    captureException(err, {
      tags: {
        ...(path ? { path } : {}),
        ...(request.method ? { method: request.method } : {}),
        ...(context.routeType ? { route_type: context.routeType } : {}),
        ...(requestId ? { request_id: requestId } : {}),
      },
      extra: { routePath: context.routePath, routerKind: context.routerKind },
    });
  } catch {
    // Never let the error reporter become the error.
  }
}
