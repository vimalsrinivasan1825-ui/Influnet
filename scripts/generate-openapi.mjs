#!/usr/bin/env node
/**
 * Builds docs/api/openapi.json from the API route files themselves.
 *
 *   node scripts/generate-openapi.mjs          # write the spec
 *   node scripts/generate-openapi.mjs --check  # exit 1 if the spec is stale
 *
 * Every route under apps/web/src/app/api is listed — public, signed-in, admin,
 * cron and webhook alike. Nothing is left out on purpose: a route that is not
 * in the spec is a route nobody reviews. tests/unit/openapi-coverage.test.ts
 * fails when a route is added without regenerating.
 *
 * What is derived from the code (always current):
 *   - path, HTTP methods, path parameters
 *   - who may call it (public / bearer / role / admin section / super admin /
 *     cron secret / webhook signature), read from the auth helper the route uses
 *   - rate limits (bucket, limit, window) read from enforceRateLimit calls
 *   - CORS (routes that send Access-Control-Allow-Origin: *)
 *   - a summary from the route's leading comment
 *
 * What is hand-written (docs/api/openapi.overrides.json): request bodies and
 * response envelopes for the routes clients call most. Envelopes differ per
 * route on purpose (see AGENTS.md), so they are written down, never guessed.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(ROOT, 'apps/web/src/app/api');
const OUT = join(ROOT, 'docs/api/openapi.json');
const OVERRIDES = join(ROOT, 'docs/api/openapi.overrides.json');
const ADMIN_ACCESS = join(ROOT, 'apps/web/src/lib/admin-access.ts');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name === 'route.ts') out.push(p);
  }
  return out;
}

/** Admin console sections, so each /api/admin route can say which one it needs. */
function adminSections() {
  const src = readFileSync(ADMIN_ACCESS, 'utf8');
  const map = new Map();
  const re = /\{\s*key:\s*'([^']+)',\s*label:\s*'([^']+)'[\s\S]*?api:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(src))) {
    for (const seg of m[3].matchAll(/'([^']+)'/g)) map.set(seg[1], { key: m[1], label: m[2] });
  }
  return map;
}

/** First sentence of the first comment in the file, or above a handler. */
function summaryFrom(src, method) {
  const clean = (t) =>
    t
      .split('\n')
      .map((l) => l.replace(/^\s*(\/\*\*?|\*\/|\*|\/\/)\s?/, '').trim())
      .filter((l) => l && !/^[-─=]+$/.test(l))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  const firstSentence = (t) => {
    const s = t.match(/^(.{12,200}?[.!?])(\s|$)/);
    return (s ? s[1] : t.slice(0, 160)).trim();
  };
  // 1. A comment block directly above `export async function METHOD`.
  //    The block may not contain `*/`, so it can never swallow code above it.
  const handler = new RegExp(
    `(/\\*(?:(?!\\*/)[\\s\\S])*\\*/|(?:[ \\t]*//[^\\n]*\\n)+)\\s*export\\s+(?:async\\s+)?function\\s+${method}\\b`,
  );
  const h = src.match(handler);
  if (h) {
    const t = clean(h[1]);
    if (t.length > 10) return firstSentence(t);
  }
  // 2. The file's header comment. Only text before the first export counts,
  //    so a comment inside a handler body is never mistaken for the summary.
  const head = src.split(/\nexport\s/)[0];
  const lead = head.match(/(\/\*(?:(?!\*\/)[\s\S])*\*\/|(?:^|\n)(?:[ \t]*\/\/[^\n]*\n)+)/);
  if (lead) {
    const t = clean(lead[1]);
    if (t.length > 10) return firstSentence(t);
  }
  return null;
}

function rateLimits(src) {
  const out = [];
  const re = /bucket:\s*['`]([^'`]+)['`][\s\S]{0,120}?limit:\s*([0-9_]+)[\s\S]{0,80}?windowMs:\s*([0-9_*\s]+?)[,\s}]/g;
  let m;
  while ((m = re.exec(src))) {
    let windowMs;
    try {
      windowMs = Function(`return (${m[3].replace(/_/g, '')})`)();
    } catch {
      windowMs = null;
    }
    out.push({ bucket: m[1], limit: Number(m[2].replace(/_/g, '')), windowSeconds: windowMs ? windowMs / 1000 : null });
  }
  return out;
}

function classify(src, apiPath, sections) {
  const seg = apiPath.split('/')[3];
  if (/withAdmin\s*\(/.test(src)) {
    // insights/<module> picks its section per module (lib/admin-insights.ts).
    if (seg === 'insights') return { kind: 'admin', section: { key: 'per-module', label: 'per report module, see lib/admin-insights.ts' } };
    // OPEN_API in lib/admin-access.ts: any active admin console member.
    if (seg === 'tier') return { kind: 'admin', section: { key: 'any', label: 'any active console member' } };
    return { kind: 'admin', section: sections.get(seg) ?? null };
  }
  if (/withSuperAdmin\s*\(/.test(src)) return { kind: 'superAdmin' };
  if (/cronAuthorized\s*\(|CRON_SECRET/.test(src)) return { kind: 'cron' };
  if (/verifyWebhookSignature|x-razorpay-signature/.test(src)) return { kind: 'webhook', provider: 'Razorpay', header: 'x-razorpay-signature' };
  if (/verifyAndParseWebhook/.test(src)) return { kind: 'webhook', provider: 'Stream', header: 'x-signature' };
  if (/svix-signature|webhook-signature/.test(src)) return { kind: 'webhook', provider: 'Resend (Svix)', header: 'svix-signature' };
  const role = src.match(/withAuth\(\s*req\s*,\s*\{\s*role:\s*'(\w+)'/);
  if (/withAuth\s*\(/.test(src)) return { kind: 'bearer', role: role ? role[1] : null };
  if (/auth\.getUser\(\)/.test(src) && /Missing Authorization header/.test(src)) return { kind: 'bearer', role: null };
  if (/auth\.getUser\(\)/.test(src)) return { kind: 'optionalBearer' };
  if (/timingSafeEqual/.test(src)) return { kind: 'sharedSecret' };
  return { kind: 'public' };
}

const ACCESS_TEXT = {
  public: 'Public: no sign-in required.',
  optionalBearer: 'Public; a Supabase access token is read when present.',
  bearer: 'Signed-in user (Supabase access token as `Authorization: Bearer`).',
  admin: 'Admin console member. GET needs `view` on the section, other methods need `manage`. Super admins always pass.',
  superAdmin: 'Super admin only.',
  cron: 'Scheduler only: `Authorization: Bearer <CRON_SECRET>`. Answers 404 otherwise.',
  webhook: 'Server-to-server webhook; the body signature is verified.',
  sharedSecret: 'Operator-only: a shared secret is compared in constant time.',
};

function securityFor(access) {
  switch (access.kind) {
    case 'public':
      return [];
    case 'optionalBearer':
      return [{}, { bearerAuth: [] }];
    case 'cron':
      return [{ cronSecret: [] }];
    case 'webhook':
    case 'sharedSecret':
      return [];
    default:
      return [{ bearerAuth: [] }];
  }
}

function build() {
  const sections = adminSections();
  const overrides = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, 'utf8')) : {};
  const files = walk(API_DIR).sort();
  const paths = {};
  const tags = new Set();

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(API_DIR, dirname(file)).split(sep).join('/');
    const apiPath = '/api/' + rel;
    const oaPath = apiPath.replace(/\[([^\]]+)\]/g, '{$1}');
    const params = [...apiPath.matchAll(/\[([^\]]+)\]/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
    const methods = METHODS.filter((m) =>
      new RegExp(`export\\s+(?:async\\s+)?(?:function\\s+${m}\\b|const\\s+${m}\\s*=)`).test(src),
    );
    if (!methods.length) continue;

    const access = classify(src, apiPath, sections);
    const limits = rateLimits(src);
    const cors = /Access-Control-Allow-Origin['"]?\s*:\s*['"]\*/.test(src);
    const seg = rel.split('/');
    const tag = seg[0] === 'admin' ? 'admin' : seg[0];
    tags.add(tag);
    const source = 'apps/web/src/app/api/' + rel + '/route.ts';

    paths[oaPath] = {};
    if (params.length) paths[oaPath].parameters = params;

    for (const method of methods) {
      const lower = method.toLowerCase();
      const key = `${method} ${oaPath}`;
      const ov = overrides[key] ?? {};
      let accessText = ACCESS_TEXT[access.kind];
      if (access.kind === 'bearer' && access.role) accessText = `Signed-in **${access.role}** only.`;
      if (access.kind === 'admin') {
        accessText += access.section
          ? ` Section: **${access.section.label}** (\`${access.section.key}\`).`
          : ' Not placed in a section, so super admins only.';
      }
      if (access.kind === 'webhook') accessText += ` Provider: ${access.provider}, header \`${access.header}\`.`;

      const lines = [`**Access:** ${accessText}`];
      if (limits.length) {
        lines.push(
          '**Rate limits:** ' +
            limits.map((l) => `\`${l.bucket}\` ${l.limit}/${l.windowSeconds ?? '?'}s`).join(', ') +
            '. Exceeding one answers 429.',
        );
      }
      if (cors) lines.push('**CORS:** `Access-Control-Allow-Origin: *` (called from the landing site).');
      lines.push(`**Source:** \`${source}\``);
      if (ov.notes) lines.push(ov.notes);

      const op = {
        tags: [tag],
        operationId: `${lower}_${rel.replace(/\[([^\]]+)\]/g, 'by_$1').replace(/[^A-Za-z0-9]+/g, '_')}`,
        summary: ov.summary ?? summaryFrom(src, method) ?? `${method} ${apiPath}`,
        description: lines.join('\n\n'),
        security: securityFor(access),
        'x-access': access.kind,
        ...(access.role ? { 'x-role': access.role } : {}),
        ...(access.section ? { 'x-admin-section': access.section.key } : {}),
        ...(limits.length ? { 'x-rate-limits': limits } : {}),
        ...(ov.parameters ? { parameters: ov.parameters } : {}),
        ...(ov.requestBody ? { requestBody: ov.requestBody } : {}),
        responses: ov.responses ?? {
          200: { description: 'Success. The body shape is route-specific — read the source before consuming it.' },
        },
      };
      if (!ov.responses) {
        if (access.kind !== 'public' && access.kind !== 'webhook') op.responses[401] = { $ref: '#/components/responses/Unauthorized' };
        if (['admin', 'superAdmin'].includes(access.kind) || access.role) op.responses[403] = { $ref: '#/components/responses/Forbidden' };
        if (limits.length) op.responses[429] = { $ref: '#/components/responses/RateLimited' };
        op.responses[500] = { $ref: '#/components/responses/ServerError' };
      }
      paths[oaPath][lower] = op;
    }
  }

  const unknown = Object.keys(overrides).filter((k) => {
    const [m, p] = k.split(' ');
    return !paths[p]?.[m.toLowerCase()];
  });
  if (unknown.length) {
    console.error('Overrides for operations that no longer exist:\n  ' + unknown.join('\n  '));
    process.exit(1);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Influnet API',
      version: '1.0.0',
      description: [
        'Every HTTP route served by `apps/web` under `/api`. Generated by `scripts/generate-openapi.mjs`; do not edit by hand.',
        '',
        '**Authentication.** Web and mobile send the Supabase access token as `Authorization: Bearer <jwt>`. Cookies are not used by API routes.',
        '',
        '**Response envelopes differ per route** — `/api/discover` returns `{results}`, `/api/collabs` returns `{collabs}`, `/api/notifications` returns a bare array. Errors are always `{ "error": string }` (some add `code` or `field`).',
        '',
        '**Client header.** Mobile sends `X-Influnet-Client: ios/1.4.2` (or `android/…`), web sends `web`. It is a label for analytics only and never changes behaviour.',
        '',
        '**Not in this spec:** Supabase PostgREST/RPC endpoints the clients reach directly with the anon key, and the `phone-otp` Supabase edge function. Those are governed by RLS and function grants in `supabase/migrations`.',
      ].join('\n'),
    },
    servers: [
      { url: 'https://dev.influnet.io', description: 'dev' },
      { url: 'https://staging.influnet.io', description: 'staging (serves real testers)' },
      { url: 'http://localhost:3000', description: 'local' },
    ],
    tags: [...tags].sort().map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Supabase JWT' },
        cronSecret: { type: 'http', scheme: 'bearer', description: 'The `CRON_SECRET` environment value.' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string', description: 'A message written for the user. Database detail is never returned.' },
            code: { type: 'string' },
            field: { type: 'string' },
          },
        },
      },
      responses: {
        Unauthorized: { description: 'Missing or invalid access token.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        Forbidden: { description: 'Signed in, but not allowed (wrong role, section, approval state, or MFA required).', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        RateLimited: { description: 'Too many requests. Retry after the window resets.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        ServerError: { description: 'Server fault; details are logged, never returned. 503 when an upstream returned an HTML error page.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  };
}

/**
 * A Swagger UI page with the spec embedded, so it opens straight from the repo
 * (a file:// page cannot fetch openapi.json beside it). Assets come from cdnjs
 * at a pinned version; nothing is published anywhere.
 */
function viewerHtml(specJson) {
  const SWAGGER = 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14';
  // `</` must not appear inside the inline script, or a summary containing
  // "</script>" would end it early.
  const inline = specJson.trim().replace(/<\//g, '<\\/');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Influnet API</title>
<!-- Generated by scripts/generate-openapi.mjs — do not edit by hand. -->
<link rel="stylesheet" href="${SWAGGER}/swagger-ui.min.css">
<style>body{margin:0;background:#fff}</style>
</head>
<body>
<div id="swagger"></div>
<script src="${SWAGGER}/swagger-ui-bundle.min.js" crossorigin="anonymous"></script>
<script>
const spec = ${inline};
window.ui = SwaggerUIBundle({
  spec,
  dom_id: '#swagger',
  deepLinking: true,
  docExpansion: 'none',
  filter: true,
  tryItOutEnabled: false,
  persistAuthorization: false,
});
</script>
</body>
</html>
`;
}

const HTML_OUT = join(ROOT, 'docs/api/index.html');
const spec = JSON.stringify(build(), null, 2) + '\n';
const html = viewerHtml(spec);
if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  const currentHtml = existsSync(HTML_OUT) ? readFileSync(HTML_OUT, 'utf8') : '';
  if (current !== spec || currentHtml !== html) {
    console.error('docs/api/openapi.json or index.html is stale. Run: node scripts/generate-openapi.mjs');
    process.exit(1);
  }
  console.log('docs/api/openapi.json is current.');
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, spec);
  writeFileSync(HTML_OUT, html);
  const ops = Object.values(JSON.parse(spec).paths).reduce(
    (n, p) => n + Object.keys(p).filter((k) => k !== 'parameters').length,
    0,
  );
  console.log(`Wrote docs/api/openapi.json — ${Object.keys(JSON.parse(spec).paths).length} paths, ${ops} operations.`);
}
