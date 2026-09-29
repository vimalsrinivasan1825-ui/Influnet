/**
 * Builds the Supabase Auth email templates from our own email design, and
 * (with --apply) pushes them into a hosted Supabase project.
 *
 * Supabase Auth sends signup confirmation, invites, magic link, email change,
 * password reset and reauthentication itself — our app code never sees those.
 * Their designs live in src/lib/email/auth-templates.ts, built from the same
 * shell as every other Influnet email so they cannot drift from the brand.
 *
 * Run:    npm run email:auth-templates
 * Apply:  npm run email:auth-templates -- --apply dev       (or staging, or a project ref)
 *         add --set-site-url to also correct the project's Site URL first
 *
 * --apply needs SUPABASE_ACCESS_TOKEN (sbp_…), from the shell or apps/web/.env.local.
 *
 * Links use {{ .SiteURL }}, never NEXT_PUBLIC_APP_URL: one generated file
 * serves dev and staging, and each project's Site URL points at its own app.
 * That makes the Site URL load-bearing, so --apply refuses a project whose
 * Site URL is still localhost. The reset and invite links go to the
 * token_hash form of /reset-password — deploy the web app before applying.
 *
 * NOTE: the placeholders must survive escaping. esc() would turn the Go
 * delimiters into entities, so they are injected via a sentinel that is
 * swapped back in after rendering.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Sentinels rendered as ordinary text, then swapped for Go template tags after
 * escaping has happened.
 */
const S = {
  siteUrl: 'https://SUPABASE_SITE_URL',
  confirmationUrl: 'https://SUPABASE_CONFIRMATION_URL',
  email: 'SUPABASE_EMAIL_PLACEHOLDER',
  newEmail: 'SUPABASE_NEW_EMAIL_PLACEHOLDER',
  token: 'SUPABASE_TOKEN_PLACEHOLDER',
  tokenHash: 'SUPABASE_TOKEN_HASH_PLACEHOLDER',
};

const SUBSTITUTIONS: Array<[RegExp, string]> = [
  [/https:\/\/SUPABASE_SITE_URL/g, '{{ .SiteURL }}'],
  [/https:\/\/SUPABASE_CONFIRMATION_URL/g, '{{ .ConfirmationURL }}'],
  [/SUPABASE_EMAIL_PLACEHOLDER/g, '{{ .Email }}'],
  [/SUPABASE_NEW_EMAIL_PLACEHOLDER/g, '{{ .NewEmail }}'],
  [/SUPABASE_TOKEN_PLACEHOLDER/g, '{{ .Token }}'],
  [/SUPABASE_TOKEN_HASH_PLACEHOLDER/g, '{{ .TokenHash }}'],
];

function substitute(html: string): string {
  return SUBSTITUTIONS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), html);
}

// Footer and dashboard links come from appUrl(); point it at the sentinel so
// they become {{ .SiteURL }} rather than whatever this machine has set.
process.env.NEXT_PUBLIC_APP_URL = S.siteUrl;
const { authEmails } = await import('../src/lib/email/auth-templates');

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../supabase/email-templates');
mkdirSync(outDir, { recursive: true });

const rendered = authEmails(S).map((email) => ({
  ...email,
  html: substitute(email.html),
  subject: substitute(email.subject),
}));

for (const email of rendered) {
  const banner = `<!--
  Influnet · Supabase Auth template: "${email.dashboardName}"
  Subject: ${email.subject}

  GENERATED FILE — do not edit by hand.
  Source: apps/web/src/lib/email/auth-templates.ts
  Rebuild: npm run email:auth-templates  (from apps/web)
  Push:    npm run email:auth-templates -- --apply dev|staging
-->
`;
  writeFileSync(resolve(outDir, email.file), banner + email.html, 'utf8');
  console.log(`✓ ${email.file.padEnd(22)} →  "${email.dashboardName}"  (subject: ${email.subject})`);
}
console.log(`\nWritten to supabase/email-templates/`);

// ── --apply ──────────────────────────────────────────────────────────────────

const PROJECTS: Record<string, { ref: string; siteUrl: string }> = {
  dev: { ref: 'jaajosocopoicmqcffuu', siteUrl: 'https://dev.influnet.io' },
  staging: { ref: 'aokdansyqxracuwsosji', siteUrl: 'https://staging.influnet.io' },
};

const args = process.argv.slice(2);
const applyIdx = args.indexOf('--apply');
if (applyIdx !== -1) {
  const target = args[applyIdx + 1];
  if (!target) throw new Error('--apply needs a target: dev, staging, or a project ref');
  const project = PROJECTS[target] ?? { ref: target, siteUrl: '' };
  await apply(project.ref, project.siteUrl, args.includes('--set-site-url'));
}

function accessToken(): string {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  // Read only this one key — loading the whole file would leak other values
  // (EMAIL_LOGO_URL etc.) into the render above.
  const envFile = resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local');
  const match = existsSync(envFile)
    ? readFileSync(envFile, 'utf8').match(/^\s*SUPABASE_ACCESS_TOKEN\s*=\s*"?([^"\s]+)/m)
    : null;
  if (!match) throw new Error('SUPABASE_ACCESS_TOKEN not set (shell or apps/web/.env.local)');
  return match[1];
}

async function apply(ref: string, expectedSiteUrl: string, setSiteUrl: boolean) {
  const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const headers = { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' };

  const current = await fetch(url, { headers });
  if (!current.ok) throw new Error(`GET auth config for ${ref}: ${current.status} ${await current.text()}`);
  const config = (await current.json()) as { site_url?: string };

  const patch: Record<string, string> = {};
  if (setSiteUrl) {
    if (!expectedSiteUrl) throw new Error(`--set-site-url needs a known target (${Object.keys(PROJECTS).join(', ')})`);
    if (config.site_url !== expectedSiteUrl) patch.site_url = expectedSiteUrl;
  } else if (!/^https:\/\//.test(config.site_url ?? '') || (expectedSiteUrl && config.site_url !== expectedSiteUrl)) {
    throw new Error(
      `${ref} has Site URL "${config.site_url}"${expectedSiteUrl ? `, expected "${expectedSiteUrl}"` : ''}. ` +
        'Every link in these templates is built on it. Re-run with --set-site-url, or fix it in the dashboard.',
    );
  }

  for (const email of rendered) {
    patch[`mailer_templates_${email.key}_content`] = email.html;
    patch[`mailer_subjects_${email.key}`] = email.subject;
  }

  const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(`PATCH auth config for ${ref}: ${res.status} ${await res.text()}`);
  const after = (await res.json()) as Record<string, string>;

  console.log(`\nApplied to ${ref}:`);
  for (const key of Object.keys(patch)) {
    const ok = after[key] === patch[key];
    console.log(`  ${ok ? '✓' : '✗'} ${key}${key === 'site_url' ? ` = ${after[key]}` : ''}`);
    if (!ok) process.exitCode = 1;
  }
}
