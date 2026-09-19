'use client';

import SmoothScroll from '@/components/motion/smooth-scroll';
import SiteNav from '@/components/site/nav';
import Faq from '@/components/site/faq';
import FinalCta from '@/components/site/final-cta';
import SiteFooter from '@/components/site/site-footer';
import AppSection from '@/components/site/app-section';
import SiteWidgets from '@/components/site/site-widgets';
import { CREATOR_FAQS as FAQS } from '@/lib/faq-data';
import Compare, { type CompareRow } from '@/components/site/compare';
import CreatorHero from './hero';
import DmStory from './dm-story';
import WhoIsAsking from './who-is-asking';
import OneLink from './one-link';
import CollabTrack from './collab-track';
import Everything from './everything';

// Every answer here is checked against the product. Do not add pricing,
// commission or payout-timing answers until those are decided and built.
const COMPARE: CompareRow[] = [
  { label: 'Brand requests in one place', cells: [true, false, 'some'] },
  { label: 'Know if the business is reviewed', cells: [true, false, false] },
  { label: 'Terms agreed in writing', cells: [true, false, 'some'] },
  { label: 'Advance confirmed before you shoot', cells: [true, false, false] },
  { label: 'Invoices and receipts on the project', cells: [true, false, 'some'] },
  { label: 'Reviews that count as proof', cells: [true, false, false] },
  { label: 'One link to share all your work', cells: [true, false, false] },
];

// The creator side of the landing. Section order follows the creator pitch:
// the DM problem → who is asking → your link → how a deal runs → everything else.
export default function CreatorPage() {
  return (
    <div className="overflow-x-clip bg-paper">
      <SmoothScroll />
      <SiteNav
        role="creator"
        cta="Create profile"
        sections={[
          ['The problem', '#problem'],
          ['How it works', '#how'],
          ['FAQ', '#faq'],
          ['Get the app', '#app'],
        ]}
      />
      <main>
        <CreatorHero />
        <DmStory />
        <WhoIsAsking />
        <OneLink />
        <CollabTrack />
        <Compare
          eyebrow="Why not just DMs"
          title="Your DMs were built for friends. Influnet was built for deals."
          body="Everything a collaboration needs, in the place brands already reach you."
          others={['Instagram DMs', 'Email and WhatsApp']}
          rows={COMPARE}
        />
        <Everything />
        <AppSection role="creator" />
        <FinalCta
          role="creator"
          title="You create the content. Influnet handles the business behind it."
          body="Instagram is for your content. Influnet is for your collaborations. Set up your profile in minutes."
          cta="Create your free profile"
        />
        <Faq title="What creators ask us first." items={FAQS} />
      </main>
      <SiteFooter role="creator" />
      <SiteWidgets role="creator" />
    </div>
  );
}
