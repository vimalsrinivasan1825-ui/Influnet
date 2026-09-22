'use client';

import Link from 'next/link';
import LogoMark from '@/components/brand/logo-mark';
import { type LegalDoc, LEGAL_DOCS } from '@/lib/legal-data';
import { APP_URL } from '@/components/site/links';
import SiteFooter from '@/components/site/site-footer';
import SiteWidgets from '@/components/site/site-widgets';

interface Props {
  doc: LegalDoc;
}

const TABS: { slug: string; label: string; href: string }[] = [
  { slug: 'terms', label: 'Terms of Service', href: '/terms' },
  { slug: 'privacy', label: 'Privacy Policy', href: '/privacy' },
  { slug: 'refunds', label: 'Refund Policy', href: '/refunds' },
];

export default function LegalView({ doc }: Props) {
  return (
    <div className="min-h-screen bg-paper text-ink selection:bg-magenta selection:text-white flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Influnet Home">
            <LogoMark size={28} />
            <span className="font-display text-2xl font-bold tracking-tight text-ink">influnet</span>
          </Link>
          <div className="flex items-center gap-5 sm:gap-7">
            <Link href="/creators" className="text-[14px] font-semibold text-ink-soft hover:text-ink transition-colors">
              For Creators
            </Link>
            <Link href="/business" className="text-[14px] font-semibold text-ink-soft hover:text-ink transition-colors">
              For Brands
            </Link>
            <a
              href={`${APP_URL}/login`}
              className="hidden sm:inline-flex rounded-full border border-line-strong px-4 py-1.5 text-[14px] font-semibold text-ink hover:bg-paper-deep transition-colors"
            >
              Log in
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        <div className="mx-auto max-w-[860px] px-4 py-12 sm:px-8 sm:py-20">
          {/* Breadcrumb / Category Tag */}
          <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.14em] text-muted">
            <span>[ Legal & Compliance ]</span>
            <span>·</span>
            <span>Last Updated: {doc.updated}</span>
          </div>

          {/* Document Heading */}
          <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl lg:text-6xl">
            {doc.title}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft sm:text-xl">
            {doc.summary}
          </p>

          {/* Document Switcher Tabs */}
          <div className="mt-8 flex flex-wrap gap-2 border-b border-line pb-4">
            {TABS.map((tab) => {
              const active = tab.slug === doc.slug;
              return (
                <Link
                  key={tab.slug}
                  href={tab.href}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition-all ${
                    active
                      ? 'bg-ink text-white shadow-sm'
                      : 'bg-paper-deep text-ink-soft hover:bg-line hover:text-ink'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          {/* Document Sections */}
          <div className="mt-12 flex flex-col gap-12">
            {doc.sections.map((section, idx) => (
              <section key={idx} className="flex flex-col gap-4">
                <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                  {section.heading}
                </h2>
                <div className="flex flex-col gap-3.5 text-[16px] leading-relaxed text-ink-soft sm:text-[17px]">
                  {section.body.map((para, pIdx) => (
                    <p key={pIdx}>{para}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Bottom Help Card */}
          <div className="mt-16 rounded-2xl border border-line-strong bg-paper-deep p-6 sm:p-8">
            <h3 className="font-display text-xl font-bold text-ink">Have questions regarding our terms or privacy?</h3>
            <p className="mt-2 text-sm text-ink-soft leading-relaxed">
              Our support and compliance team is available to assist creators and brands with any questions about stage milestones, payouts, or data protection.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="mailto:support@influnet.io"
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-ink-soft"
              >
                Contact Support (support@influnet.io)
              </a>
              <a
                href="mailto:grievance@influnet.io"
                className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-paper px-5 py-2.5 text-xs font-bold text-ink transition-colors hover:bg-line"
              >
                Grievance Officer (grievance@influnet.io)
              </a>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
      <SiteWidgets />
    </div>
  );
}
