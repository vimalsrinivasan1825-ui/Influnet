import { theme, accents, absoluteUrl, appUrl, supportEmail, type Accent } from './theme';

/**
 * Shared shell + block builders for every Influnet email.
 *
 * Rules this file exists to enforce, all of them learned the hard way in email:
 *  - Layout is `<table>`, not flex/grid. Outlook (Word rendering engine) has no
 *    support for either, and a div-based layout collapses there.
 *  - Every colour and spacing value is an INLINE style. Gmail strips <style> in
 *    most contexts; the <style> block below is used only for progressive
 *    enhancement (dark mode, small screens) that is safe to lose.
 *  - Every user-supplied string goes through esc(). A creator display name is
 *    attacker-controlled text, and unescaped it can break the layout or smuggle
 *    markup into someone's inbox.
 */

/** HTML-escape untrusted interpolation. Everything from the DB goes through this. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a URL for an href. Anything that is not http(s) or an app-relative
 * path falls back to the app root.
 *
 * The scheme check has to happen BEFORE absoluteUrl(): `javascript:alert(1)`
 * has no leading slash, so absolutising it first produces
 * `https://influnet.io/javascript:alert(1)`, which then passes an http(s) test
 * and gets emitted as a link. Reject on the raw value instead.
 */
export function escUrl(value: string): string {
  const raw = String(value ?? '').trim();
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') return appUrl();

  const url = absoluteUrl(raw);
  if (!/^https?:\/\//i.test(url)) return appUrl();
  return esc(url);
}

// ── Blocks ──────────────────────────────────────────────────────────────────

/**
 * Body copy.
 *
 * Every text block carries a `dk-*` class alongside its inline colour. The
 * inline style is what actually renders; the class exists solely so the dark
 * media query in the shell can override it. Miss the class and the block keeps
 * its light-mode colour on a dark card, which is how #4a5058 body text ends up
 * unreadable in Apple Mail's dark mode.
 */
export function p(html: string, opts: { muted?: boolean; size?: number } = {}): string {
  const color = opts.muted ? theme.muted : theme.body;
  const size = opts.size ?? 15;
  return `<p style="margin:0 0 16px;font-size:${size}px;line-height:1.65;color:${color};">${html}</p>`;
}

/** Section heading inside the card. */
export function h(text: string): string {
  return `<p style="margin:28px 0 12px;font-size:13px;line-height:1.4;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${theme.muted};">${esc(text)}</p>`;
}

/**
 * Primary call to action.
 *
 * The MSO conditional block draws the same button as VML so Outlook gets the
 * rounded fill instead of a bare underlined link; other clients ignore it and
 * render the <a>.
 */
export function button(label: string, href: string, accent: Accent = 'brand'): string {
  const bg = accent === 'brand' ? theme.brand : accents[accent].fg;
  const url = escUrl(href);
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
    <tr>
      <td align="center" bgcolor="${bg}" style="border-radius:10px;">
        <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:46px;v-text-anchor:middle;width:240px;" arcsize="22%" stroke="f" fillcolor="${bg}"><w:anchorlock/><center style="color:#ffffff;font-family:${theme.font};font-size:15px;font-weight:600;"><![endif]-->
        <a href="${url}" style="display:inline-block;padding:14px 30px;font-family:${theme.font};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(label)}</a>
        <!--[if mso]></center></v:roundrect><![endif]-->
      </td>
    </tr>
  </table>`;
}

/** Secondary, low-emphasis link shown under the button. */
export function textLink(label: string, href: string): string {
  return `<a href="${escUrl(href)}" style="color:${theme.brand};text-decoration:underline;font-weight:600;">${esc(label)}</a>`;
}

export interface PanelContent {
  /** Small uppercase label above the title. */
  eyebrow?: string;
  /** Bold first line. */
  title?: string;
  /** Body. May contain <strong> and <br />; caller is responsible for escaping data. */
  text?: string;
}

/**
 * Tinted callout — money, warnings, "here's what happens next".
 *
 * Takes structured content rather than raw HTML so the dark-mode classes are
 * applied here in one place; a raw-HTML version meant every template had to
 * remember them, and templates forget.
 */
export function panel(content: PanelContent, accent: Accent = 'neutral'): string {
  const a = accents[accent];
  const parts = [
    content.eyebrow
      ? `<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${a.fg};">${esc(content.eyebrow)}</p>`
      : '',
    content.title
      ? `<p style="margin:0 0 8px;font-size:15px;line-height:1.5;font-weight:700;color:${theme.ink};">${esc(content.title)}</p>`
      : '',
    content.text
      ? `<p style="margin:0;font-size:14px;line-height:1.7;color:${theme.body};">${content.text}</p>`
      : '',
  ].join('');

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
    <tr>
      <td bgcolor="${a.bg}" style="padding:18px 20px;border:1px solid ${a.border};border-radius:12px;">
        ${parts}
      </td>
    </tr>
  </table>`;
}

/** Label/value rows — project name, budget, deadline. */
export function details(rows: Array<[string, string] | null | undefined | false>): string {
  const cells = rows
    .filter((r): r is [string, string] => Array.isArray(r) && r[1] != null && r[1] !== '')
    .map(
      ([label, value], i) => `
      <tr>
        <td style="padding:${i === 0 ? '0' : '10px'} 16px 0 0;font-size:13px;line-height:1.5;color:${theme.muted};white-space:nowrap;vertical-align:top;">${esc(label)}</td>
        <td style="padding:${i === 0 ? '0' : '10px'} 0 0;font-size:14px;line-height:1.5;color:${theme.ink};font-weight:600;vertical-align:top;">${esc(value)}</td>
      </tr>`,
    )
    .join('');
  if (!cells) return '';
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
    <tr><td bgcolor="${theme.panel}" style="padding:18px 20px;border:1px solid ${theme.border};border-radius:12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table>
    </td></tr>
  </table>`;
}

/** Big centred figure — payment amount, rating. */
export function figure(caption: string, value: string, accent: Accent = 'success'): string {
  const a = accents[accent];
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
    <tr>
      <td align="center" bgcolor="${a.bg}" style="padding:24px 20px;border:1px solid ${a.border};border-radius:12px;">
        <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${a.fg};">${esc(caption)}</p>
        <p style="margin:8px 0 0;font-size:34px;line-height:1.1;font-weight:700;color:${a.fg};">${esc(value)}</p>
      </td>
    </tr>
  </table>`;
}

/** Quoted message preview. */
export function quote(text: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
    <tr>
      <td bgcolor="${theme.panel}" style="padding:16px 20px;border-left:3px solid ${theme.brand};border-radius:0 12px 12px 0;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:${theme.body};font-style:italic;">&ldquo;${esc(text)}&rdquo;</p>
      </td>
    </tr>
  </table>`;
}

/** Numbered "what to do next" list. Rendered as a table so spacing survives Outlook. */
export function steps(items: string[]): string {
  const rows = items
    .map(
      (item, i) => `
      <tr>
        <td width="28" style="padding:0 12px 12px 0;vertical-align:top;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>        <td width="24" height="24" align="center" bgcolor="${theme.brandSoft}" style="border-radius:12px;font-size:12px;font-weight:700;color:${theme.brand};line-height:24px;">${i + 1}</td></tr>
          </table>
        </td>
        <td style="padding:0 0 12px;font-size:15px;line-height:1.55;color:${theme.body};vertical-align:top;">${item}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">${rows}</table>`;
}

/** One-time code / bio verification code, shown monospaced and selectable. */
export function code(value: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
    <tr>
      <td align="center" bgcolor="${theme.panel}" style="padding:20px;border:1px dashed ${theme.border};border-radius:12px;">
        <span style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:0.24em;color:${theme.ink};">${esc(value)}</span>
      </td>
    </tr>
  </table>`;
}

/** Small print under the CTA — expiry warnings, "if you didn't request this". */
export function fineprint(html: string): string {
  return `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${theme.muted};">${html}</p>`;
}

export function divider(): string {    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td height="1" bgcolor="${theme.border}" style="line-height:1px;font-size:0;">&nbsp;</td></tr></table>`;
}

// ── Shell ───────────────────────────────────────────────────────────────────

export interface ShellOptions {
  /** Inbox-preview line. Without one, clients show the first words of the body. */
  preheader: string;
  /** Big headline inside the coloured header band. */
  heading: string;
  /** Optional line under the heading, inside the band. */
  kicker?: string;
  /** Main content — compose with the block helpers above. */
  body: string;
  /** Rendered in the footer. Omitted for tier-A account mail, which is not optional. */
  unsubscribeUrl?: string;
  /** Footer note explaining WHY this email was sent. Builds trust, cuts spam reports. */
  reason?: string;
}

function wordmark(): string {
  const logo = process.env.EMAIL_LOGO_URL;
  if (logo) {
    return `<img src="${esc(logo)}" width="132" alt="Influnet" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:132px;" />`;
  }
  // Text wordmark by default: an <img> that fails to load (blocked remote
  // images are the norm in Outlook and Gmail's default) leaves a broken box
  // where the brand should be. Text always renders.
  return `<span style="font-size:21px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">influnet<span style="color:#ffe3f0;">.</span></span>`;
}

/**
 * Wrap body content in the full document.
 *
 * The header band uses a background-image gradient with a `bgcolor` fallback:
 * clients that understand CSS gradients get brand → coral, Outlook gets flat
 * brand pink. Both are on-brand; neither is broken.
 */
export function renderEmail(opts: ShellOptions): string {
  const year = new Date().getFullYear();
  const support = supportEmail();

  const footerLinks = [
    `<a href="${escUrl('/dashboard')}" style="color:${theme.muted};text-decoration:underline;">Dashboard</a>`,
    `<a href="mailto:${esc(support)}" style="color:${theme.muted};text-decoration:underline;">${esc(support)}</a>`,
    opts.unsubscribeUrl
      ? `<a href="${escUrl(opts.unsubscribeUrl)}" style="color:${theme.muted};text-decoration:underline;">Unsubscribe</a>`
      : null,
  ]
    .filter(Boolean)
    .join(`<span style="color:${theme.faint};"> &nbsp;·&nbsp; </span>`);

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${esc(opts.heading)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  /* Progressive enhancement only — everything critical is inlined below. */
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  table { border-collapse:collapse; }
  img { -ms-interpolation-mode:bicubic; }
  a { color:${theme.brand}; }
  @media only screen and (max-width:620px) {
    .sm-px { padding-left:22px !important; padding-right:22px !important; }
    .sm-py { padding-top:28px !important; padding-bottom:28px !important; }
    .sm-h1 { font-size:23px !important; }
  }
  /* Light mode only — dark mode support removed. */
</style>
</head>
<body style="margin:0;padding:0;background:${theme.page};font-family:${theme.font};-webkit-font-smoothing:antialiased;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(opts.preheader)}</div>
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.page};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="${theme.width}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${theme.width}px;">

          <!-- Header band -->
          <tr>
            <td class="sm-px" bgcolor="${theme.brand}" background="" style="padding:30px 36px;border-radius:${theme.radius} ${theme.radius} 0 0;background-color:${theme.brand};background-image:linear-gradient(120deg, ${theme.brand} 0%, ${theme.brandAlt} 100%);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td>${wordmark()}</td></tr>
                <tr><td style="padding-top:22px;">
                  <h1 class="sm-h1" style="margin:0;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">${esc(opts.heading)}</h1>
                  ${opts.kicker ? `<p style="margin:8px 0 0;font-size:15px;line-height:1.5;color:#ffe9f3;">${esc(opts.kicker)}</p>` : ''}
                </td></tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td class="sm-px sm-py" bgcolor="${theme.surface}" style="padding:32px 36px 28px;background:${theme.surface};border:1px solid ${theme.border};border-top:0;border-radius:0 0 ${theme.radius} ${theme.radius};">
              ${opts.body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="sm-px" style="padding:24px 36px 8px;text-align:center;">
              ${opts.reason ? `<p style="margin:0 0 12px;font-size:12px;line-height:1.6;color:${theme.muted};">${esc(opts.reason)}</p>` : ''}
              <p style="margin:0 0 10px;font-size:12px;line-height:1.6;color:${theme.muted};">${footerLinks}</p>
              <p style="margin:0;font-size:12px;line-height:1.6;color:${theme.faint};">&copy; ${year} Influnet &nbsp;·&nbsp; Made for creators and brands in India</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
