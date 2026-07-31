// Landing page for the LEGACY ownership-verification links (…/vf/<code>) from
// before the bio marker became the creator's own public profile link — see
// api/verification/ownership/route.ts. New claims never mint one of these; this
// stays only so any already-issued vf_ link still lands somewhere sensible.

export const metadata = {
  title: "Influnet verification",
  robots: { index: false, follow: false },
};

export default async function VerificationLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await params; // code isn't used here; matching happens server-side during the scrape.
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface-raised p-8 text-center">
        <h1 className="text-xl font-extrabold tracking-tight text-content">Influnet verification link</h1>
        <p className="mt-2 text-sm text-content-soft">
          This is a one-time link used to confirm ownership of a social account on Influnet. If you added it to
          your bio to verify your account, you can return to Influnet and tap <strong>Verify</strong> — then remove
          this link once you&apos;re verified.
        </p>
        <a
          href="/dashboard/settings"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong"
        >
          Back to Influnet
        </a>
      </div>
    </div>
  );
}
