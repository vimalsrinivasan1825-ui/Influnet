/**
 * Generates the HTML you paste into Supabase Dashboard → Authentication →
 * Emails → Templates.
 *
 * Why a generator instead of hand-written HTML: Supabase Auth sends signup
 * confirmation, password reset, magic link, email change and reauthentication
 * itself — our app code never sees those. Without this script those five mails
 * would be maintained separately from the twenty in lib/email/templates.ts and
 * would drift the first time the brand colour changed. Here they are built
 * from the same shell, with Supabase's Go template variables
 * ({{ .ConfirmationURL }} etc.) substituted in place of our data.
 *
 * Run:  npm run email:auth-templates
 * Then: paste each file's contents into the matching Supabase template.
 *
 * NOTE: the placeholders must survive escaping. esc() would turn the Go
 * delimiters into entities, so they are injected via a sentinel that is
 * swapped back in after rendering.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  verifyEmailEmail,
  passwordResetEmail,
  emailChangeEmail,
  verificationCodeEmail,
  welcomeEmail,
} from '../src/lib/email/templates';

/**
 * Sentinels rendered as ordinary text, then swapped for Go template tags after
 * escaping has happened.
 */
const S = {
  confirmationUrl: 'https://SUPABASE_CONFIRMATION_URL',
  email: 'SUPABASE_EMAIL_PLACEHOLDER',
  newEmail: 'SUPABASE_NEW_EMAIL_PLACEHOLDER',
  token: 'SUPABASE_TOKEN_PLACEHOLDER',
};

const SUBSTITUTIONS: Array<[RegExp, string]> = [
  [/https:\/\/SUPABASE_CONFIRMATION_URL/g, '{{ .ConfirmationURL }}'],
  [/SUPABASE_EMAIL_PLACEHOLDER/g, '{{ .Email }}'],
  [/SUPABASE_NEW_EMAIL_PLACEHOLDER/g, '{{ .NewEmail }}'],
  [/SUPABASE_TOKEN_PLACEHOLDER/g, '{{ .Token }}'],
];

function substitute(html: string): string {
  return SUBSTITUTIONS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), html);
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../supabase/email-templates');
mkdirSync(outDir, { recursive: true });

const files: Array<{ name: string; supabaseTemplate: string; html: string }> = [
  {
    name: 'confirm-signup.html',
    supabaseTemplate: 'Confirm signup',
    html: verifyEmailEmail.render({
      name: 'there',
      verifyUrl: S.confirmationUrl,
      expiresInHours: 24,
    }),
  },
  {
    name: 'reset-password.html',
    supabaseTemplate: 'Reset password',
    html: passwordResetEmail.render({
      name: 'there',
      resetUrl: S.confirmationUrl,
      expiresInMinutes: 60,
    }),
  },
  {
    name: 'magic-link.html',
    supabaseTemplate: 'Magic Link',
    html: verifyEmailEmail.render({
      name: 'there',
      verifyUrl: S.confirmationUrl,
      expiresInHours: 1,
    }),
  },
  {
    name: 'change-email.html',
    supabaseTemplate: 'Change Email Address',
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
    html: welcomeEmail.render({
      name: 'there',
      role: 'influencer',
      dashboardUrl: S.confirmationUrl,
    }),
  },
];

for (const file of files) {
  const banner = `<!--
  Influnet · Supabase Auth template: "${file.supabaseTemplate}"

  GENERATED FILE — do not edit by hand.
  Source: apps/web/src/lib/email/templates.ts
  Rebuild: npm run email:auth-templates  (from apps/web)

  Paste the whole file into Supabase Dashboard → Authentication → Emails →
  ${file.supabaseTemplate} → Message body (source view).
-->
`;
  writeFileSync(resolve(outDir, file.name), banner + substitute(file.html), 'utf8');
  console.log(`✓ ${file.name}  →  Supabase template "${file.supabaseTemplate}"`);
}

console.log(`\nWritten to supabase/email-templates/`);
