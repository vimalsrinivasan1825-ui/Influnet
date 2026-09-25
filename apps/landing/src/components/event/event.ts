import QRCode from 'qrcode';

// The event /join currently registers people for. The API only accepts slugs it
// knows (apps/web/src/app/api/event-pass/route.ts), so a new event is a change
// in both places.
export const EVENT = {
  slug: 'silicon-nexus-s2',
  name: 'Silicon Nexus S2',
  edition: 'September Edition',
  tagline: 'Soft launch of Influnet',
  dateLabel: 'Friday, 25 Sep 2026',
  dateShort: 'Fri, 25 Sep',
  timeLabel: '3 PM – 6 PM IST',
  venue: 'StartupTN Office',
  city: 'Chennai',
  address:
    'Office Space, 10th Floor, Chennai Metro Rail Limited, Metro Station, near Nandanam, Nandanam, Chennai, Tamil Nadu 600035',
  mapUrl:
    'https://www.google.com/maps/search/?api=1&query=StartupTN+Nandanam+Metro+Station+Chennai+600035',
  poster: '/events/silicon-nexus-s2.webp',
  // Google Calendar wants UTC: 3–6 PM IST is 09:30–12:30Z.
  calendarUrl:
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    '&text=' + encodeURIComponent('Silicon Nexus S2 — Influnet soft launch') +
    '&dates=20260925T093000Z/20260925T123000Z' +
    '&location=' + encodeURIComponent('StartupTN, 10th Floor, CMRL Nandanam Metro Station, Chennai 600035') +
    '&details=' + encodeURIComponent('Show your Influnet entry pass (QR) at the entrance.'),
} as const;

// Shown on the pass (/join) and on the survey's thank-you screen.
export const AGENDA = [
  { time: '3:00 – 3:10 PM', title: 'Intro' },
  { time: '3:10 – 3:50 PM', title: 'Influnet showcase', detail: 'Interaction with creators and influencers' },
  { time: '4:00 – 5:00 PM', title: 'Business GTM & AI enablement', detail: 'Discussion and product showcase' },
  { time: '5:00 – 6:00 PM', title: 'Food & networking' },
] as const;

export type Pass = { passCode: string; name: string };

/** One SVG path for every dark module, in module units (no quiet zone). */
export function qrPath(text: string): { d: string; size: number } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = modules.size;
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { d, size };
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
