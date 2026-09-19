'use client';

import SmoothScroll from '@/components/motion/smooth-scroll';
import SiteNav from '@/components/site/nav';
import Statement from '@/components/site/statement';
import Compare, { type CompareRow } from '@/components/site/compare';
import KineticWords from '@/components/site/kinetic-words';
import Faq from '@/components/site/faq';
import FinalCta from '@/components/site/final-cta';
import SiteFooter from '@/components/site/site-footer';
import AppSection from '@/components/site/app-section';
import SiteWidgets from '@/components/site/site-widgets';
import { BUSINESS_FAQS as FAQS } from '@/lib/faq-data';
import BrandHero from '@/components/brands/hero';
import WhyTrio from '@/components/brands/why-trio';
import Shortlist from '@/components/brands/shortlist';
import CampaignSteps from '@/components/brands/campaign-steps';

const COMPARE: CompareRow[] = [
  { label: 'Creators who proved they own the account', cells: [true, false, false] },
  { label: 'Brief, chat and files in one place', cells: [true, 'some', false] },
  { label: 'Terms agreed by both sides', cells: [true, 'some', 'some'] },
  { label: 'Payments tied to project stages', cells: [true, false, false] },
  { label: 'Invoices and receipts per project', cells: [true, false, 'some'] },
  { label: 'Every project and whose move it is', cells: [true, false, 'some'] },
  { label: 'Reviews from completed work', cells: [true, false, false] },
];

// The brand side of the landing.
export default function BusinessPage() {
  return (
    <div className="overflow-x-clip bg-paper">
      <SmoothScroll />
      <SiteNav
        role="business"
        cta="Get started"
        sections={[
          ['Why Influnet', '#why'],
          ['Find creators', '#find'],
          ['How it works', '#steps'],
          ['FAQ', '#faq'],
          ['Get the app', '#app'],
        ]}
      />
      <main>
        <BrandHero />
        <WhyTrio />
        <Statement eyebrow="The real problem">
          Campaigns rarely fall apart at finding creators. They fall apart in the <em>follow-ups</em>, the{' '}
          <em>missed deadlines</em> and the <em>payments nobody can trace</em>. Influnet puts every one of those on the
          record.
        </Statement>
        <Shortlist />
        <CampaignSteps />
        <Compare
          eyebrow="Why not DMs and spreadsheets"
          title="Built for running collabs, not for chasing them."
          body="What you get on Influnet, next to how most brands run creator campaigns today."
          others={['DMs and WhatsApp', 'Spreadsheets']}
          rows={COMPARE}
        />
        <section className="overflow-hidden bg-paper pb-24 sm:pb-32">
          <KineticWords
            rowA={['Campaigns', 'Shortlists', 'Verified creators', 'Written terms', 'Payment gates']}
            rowB={['Projects', 'Invoices', 'Receipts', 'Reviews', 'Applications']}
          />
        </section>
        <AppSection role="business" />
        <FinalCta
          role="business"
          title="Your next campaign, run like a business."
          body="Post a campaign, shortlist real creators and keep every step on the record."
          cta="Post your first campaign"
        />
        <Faq title="What brands ask us first." items={FAQS} />
      </main>
      <SiteFooter role="business" />
      <SiteWidgets role="business" />
    </div>
  );
}
