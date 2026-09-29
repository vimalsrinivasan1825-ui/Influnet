/**
 * Builds the Supabase Auth email templates from our own email design, and
 * (with --apply) pushes them into a hosted Supabase project.
 *
 * Why a generator instead of hand-written HTML: Supabase Auth sends signup
 * confirmation, password reset, magic link, email change and reauthentication
 * itself — our app code never sees those. Without this script those five mails
 * would be maintained separately from the twenty in lib/email/templates.ts and
 * would drift the first time the brand colour changed. Here they are built
 * from the same shell, with Supabase's Go template variables
 * ({{ .ConfirmationURL }} etc.) substituted in place of our data.
 *
 * Run:    npm run email:auth-templates
 * Apply:  npm run email:auth-templates -- --apply dev       (or staging, or a project ref)
 *         add --set-site-url to also correct the project's Site URL first
 *
 * --apply needs SUPABASE_ACCESS_TOKEN (sbp_…), from the shell or apps/web/.env.local.
 * It only pushes templates marked `apply: true` — the others are still the
 * wrong design for their purpose (see each entry) and would read worse than
 * Supabase's plain default.
 *
 * Links use {{ .SiteURL }}, never NEXT_PUBLIC_APP_URL: one generated file
 * serves dev and staging, and each project's Site URL points at its own app.
 * That makes the Site URL load-bearing, so --apply refuses a project whose
 * Site URL is still localhost.
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
const { verifyEmailEmail, passwordResetEmail, emailChangeEmail, verificationCodeEmail, welcomeEmail } =
  await import('../src/lib/email/templates');

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../supabase/email-templates');
mkdirSync(outDir, { recursive: true });

type AuthTemplate = {
  name: string;
  supabaseTemplate: string;
  /** Management API key suffix: mailer_templates_<key>_content / mailer_subjects_<key>. */
  key: string;
  subject: string;
  html: string;
  /** Pushed by --apply. False = not yet the right design for this mail. */
  apply: boolean;
};

const files: AuthTemplate[] = [
  {
    name: 'confirm-signup.html',
    supabaseTemplate: 'Confirm signup',
    key: 'confirmation',
    subject: verifyEmailEmail.subject({} as never),
    // Held back: autoconfirm is on, so this is never sent yet, and it still
    // uses the /verify redirect that breaks across browsers under PKCE.
    apply: false,
    html: verifyEmailEmail.render({
      name: 'there',
      verifyUrl: S.confirmationUrl,
      expiresInHours: 24,
    }),
  },
  {
    name: 'reset-password.html',
    supabaseTemplate: 'Reset password',
    key: 'recovery',
    subject: passwordResetEmail.subject({} as never),
    apply: true,
    // token_hash, not {{ .ConfirmationURL }}: /reset-password verifies it
    // itself, so the link works in any browser (web asks with PKCE, whose code
    // only redeems in the asking browser; mobile asks from the app) and does
    // not depend on the redirect allow-list.
    html: passwordResetEmail.render({
      name: 'there',
      resetUrl: `${S.siteUrl}/reset-password?token_hash=${S.tokenHash}&type=recovery`,
      expiresInMinutes: 60,
    }),
  },
  {
    name: 'magic-link.html',
    supabaseTemplate: 'Magic Link',
    key: 'magic_link',
    subject: verifyEmailEmail.subject({} as never),
    // Held back: reuses the "Confirm your email" design. The app has no
    // magic-link sign-in, so Supabase's default is never seen anyway.
    apply: false,
    html: verifyEmailEmail.render({
      name: 'there',
      verifyUrl: S.confirmationUrl,
      expiresInHours: 1,
    }),
  },
  {
    name: 'change-email.html',
    supabaseTemplate: 'Change Email Address',
    key: 'email_change',
    subject: emailChangeEmail.subject({} as never),
    // Held back: not reviewed against the live change-email flow yet.
    apply: false,
    html: emailChangeEmail.render({
      name: 'there',
      oldEmail: S.email,
      newEmail: S.newEmail,
      confirmUrl: S.confirmationUrl,
    }),
  },
  {
    name: 'reauthentication.html',
    supabaseTemplate: 'Reauthentication',
    key: 'reauthentication',
    subject: verificationCodeEmail.subject({} as never),
    // Held back: this is the social-handle ownership design, not a sign-in code.
    apply: false,
    html: verificationCodeEmail.render({
      name: 'there',
      platform: 'Influnet',
      handle: S.email,
      code: S.token,
      expiresInMinutes: 60,
      dashboardUrl: '/dashboard',
    }),
  },
  {
    name: 'invite.html',
    supabaseTemplate: 'Invite user',
    key: 'invite',
    subject: welcomeEmail.subject({} as never),
    // Held back: renders as "Welcome, there". Team invites are links shown to
    // the admin (lib/admin-team.ts), not this mail.
    apply: false,
    html: welcomeEmail.render({
      name: 'there',
      role: 'influencer',
      dashboardUrl: S.confirmationUrl,
    }),
  },
];

const rendered = files.map((file) => ({
  ...file,
  html: substitute(file.html),
  subject: substitute(file.subject),
}));

for (const file of rendered) {
  const banner = `<!--
  Influnet · Supabase Auth template: "${file.supabaseTemplate}"

  GENERATED FILE — do not edit by hand.
  Source: apps/web/src/lib/email/templates.ts
  Rebuild: npm run email:auth-templates  (from apps/web)
  ${file.apply
    ? `Push:    npm run email:auth-templates -- --apply dev|staging`
    : `Not pushed by --apply yet — see the note on this entry in scripts/build-auth-email-templates.ts.`}
-->
`;
  writeFileSync(resolve(outDir, file.name), banner + file.html, 'utf8');
  console.log(`✓ ${file.name}  →  Supabase template "${file.supabaseTemplate}"${file.apply ? '' : '  (not applied)'}`);
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

  for (const file of rendered.filter((f) => f.apply)) {
    patch[`mailer_templates_${file.key}_content`] = file.html;
    patch[`mailer_subjects_${file.key}`] = file.subject;
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
