import type { Metadata } from 'next';
import EventRegistration from '@/components/event/event-registration';

// Ad landing page for the Silicon Nexus S2 soft launch: register → entry pass.
// (The earlier multi-step creator survey that lived here is in git history.)

const title = 'Silicon Nexus S2 — Influnet soft launch | Get your entry pass';
const description =
  'Influencers, content creators and artists: register for the Influnet soft launch at StartupTN, Chennai on 25 Sep 2026, 3–6 PM, and get your personal entry pass.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: 'website', images: [{ url: '/events/silicon-nexus-s2.webp', width: 1254, height: 1254 }] },
  twitter: { title, description, card: 'summary_large_image', images: ['/events/silicon-nexus-s2.webp'] },
};

export default function JoinPage() {
  return <EventRegistration />;
}
