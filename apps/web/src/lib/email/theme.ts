/**
 * Email design tokens.
 *
 * These mirror the app's brand variables in globals.css (`--brand: #ee3e96`,
 * `--brand-2: #f26e59`) but are written as literal hex, because email clients
 * support neither CSS custom properties nor oklch(). Everything an email
 * renders must be an inline style with a literal colour.
 */
export const theme = {
  brand: '#ee3e96',
  brandAlt: '#f26e59',
  brandStrong: '#d6358a',
  brandSoft: '#fdf2f8',
  brandSoftBorder: '#f8d3e6',

  ink: '#101317',
  body: '#4a5058',
  muted: '#8b919b',
  faint: '#b4b9c1',

  page: '#f5f6f8',
  surface: '#ffffff',
  panel: '#f7f8fa',
  border: '#e6e8ec',

  success: '#12855c',
  successSoft: '#eefaf4',
  successBorder: '#bfe8d5',
  danger: '#c8324a',
  dangerSoft: '#fdf1f3',
  dangerBorder: '#f5cdd5',
  warning: '#a76a05',
  warningSoft: '#fff8ec',
  warningBorder: '#f3dcb4',

  /** Segoe UI first so Windows Outlook doesn't fall back to Times New Roman. */
  font: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif",
  radius: '14px',
  width: 600,
} as const;

export type Accent = 'brand' | 'success' | 'danger' | 'warning' | 'neutral';

export const accents: Record<Accent, { fg: string; bg: string; border: string }> = {
  brand: { fg: theme.brand, bg: theme.brandSoft, border: theme.brandSoftBorder },
  success: { fg: theme.success, bg: theme.successSoft, border: theme.successBorder },
  danger: { fg: theme.danger, bg: theme.dangerSoft, border: theme.dangerBorder },
  warning: { fg: theme.warning, bg: theme.warningSoft, border: theme.warningBorder },
  neutral: { fg: theme.body, bg: theme.panel, border: theme.border },
};

/** Absolute base URL for links inside emails. Never a relative path — there is no origin in an inbox. */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://influnet.io').replace(/\/+$/, '');
}

/**
 * Make a link absolute. Emails get `/dashboard/x` paths from notify(); a
 * relative href in an inbox resolves against the mail client, i.e. nowhere.
 */
export function absoluteUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return `${appUrl()}${href.startsWith('/') ? '' : '/'}${href}`;
}

/** Support inbox shown as Reply-To and in the footer. */
export function supportEmail(): string {
  return process.env.EMAIL_REPLY_TO || 'support@influnet.io';
}
