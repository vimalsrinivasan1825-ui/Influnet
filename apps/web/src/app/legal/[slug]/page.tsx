import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LEGAL_DOCS, getLegalDoc, unresolved } from '../legal-content';

/**
 * The legal pages Razorpay's onboarding checks for, and that users are
 * entitled to read before they hand over money.
 *
 * ── The draft banner is load-bearing ─────────────────────────────────────
 * While any `[[PLACEHOLDER]]` remains, the page shows an unmissable banner
 * and sets `robots: noindex`. A half-finished policy page that Google has
 * indexed is materially worse than a 404: it looks like the finished article
 * and tells a reader that nobody is minding the details. The banner disappears
 * on its own the moment the last placeholder is filled in — there is no flag
 * to remember to flip.
 */

export const dynamic = 'force-static';

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getLegalDoc(slug);
  if (!doc) return {};
  const draft = unresolved(doc).length > 0;
  return {
    title: `${doc.title} · Influnet`,
    description: doc.summary,
    // Never let an unfinished policy into an index.
    robots: draft ? { index: false, follow: false } : undefined,
  };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = getLegalDoc(slug);
  if (!doc) notFound();

  const gaps = unresolved(doc);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <nav className="mb-10 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {LEGAL_DOCS.map((d) => (
          <Link
            key={d.slug}
            href={`/legal/${d.slug}`}
            className={
              d.slug === doc.slug
                ? 'font-semibold text-foreground underline underline-offset-4'
                : 'text-muted-foreground hover:text-foreground'
            }
          >
            {d.title}
          </Link>
        ))}
      </nav>

      {gaps.length > 0 && (
        <div className="mb-10 rounded-lg border-2 border-amber-400 bg-amber-50 p-5">
          <p className="font-semibold text-amber-900">
            Draft — not yet published. {gaps.length} detail
            {gaps.length === 1 ? '' : 's'} still to fill in.
          </p>
          <p className="mt-2 text-sm text-amber-900">
            This page is excluded from search engines until every placeholder below is replaced in{' '}
            <code className="rounded bg-amber-100 px-1">
              apps/web/src/app/legal/legal-content.ts
            </code>
            . Have the result reviewed by a lawyer before taking payments from the public — the
            clauses that decide real money are business decisions, not boilerplate.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {gaps.map((g) => (
              <li
                key={g}
                className="rounded bg-amber-100 px-2 py-1 font-mono text-xs text-amber-900"
              >
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{doc.summary}</p>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {doc.updated}</p>
      </header>

      <div className="space-y-9">
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-3 text-xl font-semibold">{section.heading}</h2>
            <div className="space-y-3">
              {section.body.map((p, i) => (
                <p key={i} className="leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
