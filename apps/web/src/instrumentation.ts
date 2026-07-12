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
  const label = (s: string) => s.padEnd(13);

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
