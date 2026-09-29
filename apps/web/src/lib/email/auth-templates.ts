import { renderEmail, p, button, panel, code, fineprint, divider, esc } from './layout';
import { theme } from './theme';
import { passwordResetEmail } from './templates';

/**
 * The six emails Supabase Auth sends itself — our code never sees them, so
 * they are not in the templates.ts registry. They are rendered with Supabase's
 * Go placeholders passed in as data (scripts/build-auth-email-templates.ts
 * swaps sentinels for the real `{{ .X }}` tags after escaping) and pushed to
 * each project with `npm run email:auth-templates -- --apply <env>`.
 *
 * Every link and code expires after the project's `mailer_otp_exp`, 1 hour on
 * both dev and staging, which is what the copy says.
 */

/** Supabase template variables, as the sentinels the build script substitutes. */
export interface AuthPlaceholders {
  siteUrl: string;
  confirmationUrl: string;
  email: string;
  newEmail: string;
  token: string;
  tokenHash: string;
}

export interface AuthEmail {
  /** Management API suffix: mailer_templates_<key>_content / mailer_subjects_<key>. */
  key: 'confirmation' | 'invite' | 'magic_link' | 'email_change' | 'recovery' | 'reauthentication';
  /** Name in Supabase Dashboard → Authentication → Emails. */
  dashboardName: string;
  file: string;
  subject: string;
  html: string;
}

const REASON =
  'This is an account security email for your Influnet account. We send these regardless of your notification settings.';

const pasteLink = (url: string) =>
  fineprint(`Button not working? Paste this into your browser:<br /><span style="color:${theme.muted};word-break:break-all;">${esc(url)}</span>`);

export function authEmails(s: AuthPlaceholders): AuthEmail[] {
  // Same token_hash shape as the reset link: /reset-password verifies it on
  // submit, so it works in any browser and the invitee picks their password.
  const inviteUrl = `${s.siteUrl}/reset-password?token_hash=${s.tokenHash}&type=invite`;
  const resetUrl = `${s.siteUrl}/reset-password?token_hash=${s.tokenHash}&type=recovery`;

  return [
    {
      key: 'confirmation',
      dashboardName: 'Confirm sign up',
      file: 'confirm-signup.html',
      subject: 'Confirm your Influnet email address',
      html: renderEmail({
        preheader: 'One click confirms your address and finishes your Influnet signup.',
        heading: 'Confirm your email',
        kicker: 'One last step.',
        reason: REASON,
        body: [
          p(`Hi there, confirm that <strong>${esc(s.email)}</strong> is your address to finish setting up your Influnet account.`),
          button('Confirm my email', s.confirmationUrl),
          fineprint('This link expires in 1 hour and can only be used once. If it has expired, sign in and we will send you a new one.'),
          fineprint('If you did not create an Influnet account, ignore this email — nothing will be activated.'),
          divider(),
          pasteLink(s.confirmationUrl),
        ].join(''),
      }),
    },
    {
      key: 'invite',
      dashboardName: 'Invite user',
      file: 'invite.html',
      subject: "You're invited to Influnet",
      html: renderEmail({
        preheader: 'Accept your invitation and choose a password to get started.',
        heading: "You're invited",
        kicker: 'An Influnet account is waiting for you.',
        reason: REASON,
        body: [
          p(`Hi there, you have been invited to join Influnet as <strong>${esc(s.email)}</strong>. Accept the invitation and choose a password to sign in.`),
          button('Accept invitation', inviteUrl),
          fineprint('This invitation link expires in 1 hour and can only be used once. If it has expired, ask the person who invited you to send a new one.'),
          fineprint('Not expecting this? You can ignore it — no account is usable until the invitation is accepted.'),
          divider(),
          pasteLink(inviteUrl),
        ].join(''),
      }),
    },
    {
      key: 'magic_link',
      dashboardName: 'Magic link or OTP',
      file: 'magic-link.html',
      subject: 'Your Influnet sign-in link',
      html: renderEmail({
        preheader: 'Use the link or the code inside to sign in. It expires in an hour.',
        heading: 'Sign in to Influnet',
        reason: REASON,
        body: [
          p(`Hi there, here is your sign-in link for <strong>${esc(s.email)}</strong>.`),
          button('Sign in', s.confirmationUrl),
          p('Or enter this one-time code:', { muted: true, size: 14 }),
          code(s.token),
          fineprint('The link and the code expire in 1 hour and can each be used once.'),
          panel(
            {
              title: "Didn't try to sign in?",
              text: 'You can safely ignore this email — nobody can sign in without the link or code above. Never share the code with anyone, including someone claiming to be from Influnet.',
            },
            'warning',
          ),
          divider(),
          pasteLink(s.confirmationUrl),
        ].join(''),
      }),
    },
    {
      key: 'email_change',
      dashboardName: 'Change email address',
      file: 'change-email.html',
      subject: 'Confirm your new Influnet email address',
      html: renderEmail({
        preheader: 'Confirm the change to finish updating the email on your Influnet account.',
        heading: 'Confirm your new email',
        reason: REASON,
        body: [
          p('Hi there, we got a request to change the email address on your Influnet account:'),
          panel({ text: `From <strong>${esc(s.email)}</strong><br />To <strong>${esc(s.newEmail)}</strong>` }, 'neutral'),
          button('Confirm new email', s.confirmationUrl),
          fineprint('This link expires in 1 hour and can only be used once. Until you confirm, you keep signing in with your current address.'),
          panel(
            {
              title: "Didn't ask for this?",
              text: 'Do not click the button. Change your password straight away and reply to this email so we can check your account.',
            },
            'warning',
          ),
          divider(),
          pasteLink(s.confirmationUrl),
        ].join(''),
      }),
    },
    {
      key: 'recovery',
      dashboardName: 'Reset password',
      file: 'reset-password.html',
      subject: passwordResetEmail.subject({} as never),
      // token_hash, not {{ .ConfirmationURL }}: /reset-password verifies it
      // itself, so the link works in any browser (web asks with PKCE, whose
      // code only redeems in the asking browser; mobile asks from the app) and
      // does not depend on the redirect allow-list.
      html: passwordResetEmail.render({ name: 'there', resetUrl, expiresInMinutes: 60 }),
    },
    {
      key: 'reauthentication',
      dashboardName: 'Reauthentication',
      file: 'reauthentication.html',
      subject: `${s.token} is your Influnet verification code`,
      html: renderEmail({
        preheader: 'Enter this code to confirm it is you. It expires in an hour.',
        heading: 'Confirm it’s you',
        kicker: 'You are changing a sensitive setting.',
        reason: REASON,
        body: [
          p('Hi there, enter this code in Influnet to confirm it is really you before we make the change:'),
          code(s.token),
          fineprint('This code expires in 1 hour and can only be used once.'),
          panel(
            {
              title: "Didn't request this?",
              text: 'Someone may know your password. Do not share this code — change your password and reply to this email so we can help.',
            },
            'warning',
          ),
        ].join(''),
      }),
    },
  ];
}
