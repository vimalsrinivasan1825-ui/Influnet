import Link from "next/link";
import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@influnet/core";

/**
 * Public account-deletion page.
 *
 * Google Play requires a publicly reachable URL that explains how to delete an
 * account and what happens to the data — reachable WITHOUT installing the app or
 * signing in, which is why this sits outside /dashboard. Apple's requirement is
 * different and is met inside the app (Settings → Delete account).
 */
export const metadata: Metadata = {
  title: "Delete your Influnet account",
  description: "How to delete your Influnet account and what happens to your data.",
};

export default function DeleteAccountPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-5 py-14">
      <div>
        <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-brand">Your data</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-content sm:text-3xl">
          Delete your Influnet account
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-content-soft">
          You can delete your account yourself, at any time, from the app or the web dashboard. You do not
          need to contact us first.
        </p>
      </div>

      <section className="rounded-2xl border border-hairline bg-surface-card p-5">
        <h2 className="text-base font-bold text-content">In the mobile app</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-content-soft">
          <li>Open Influnet and sign in.</li>
          <li>Tap your profile picture, then <strong>Settings</strong>.</li>
          <li>Scroll to <strong>Danger zone</strong> and tap <strong>Delete account</strong>.</li>
          <li>Confirm. Your account is removed immediately.</li>
        </ol>
      </section>

      <section className="rounded-2xl border border-hairline bg-surface-card p-5">
        <h2 className="text-base font-bold text-content">On the web</h2>
        <p className="mt-2 text-sm text-content-soft">
          Sign in, open{" "}
          <Link href="/dashboard/settings" className="font-semibold text-brand hover:underline">
            Settings
          </Link>
          , and use <strong>Delete account</strong> at the bottom of the page.
        </p>
      </section>

      <section className="rounded-2xl border border-hairline bg-surface-card p-5">
        <h2 className="text-base font-bold text-content">What is deleted</h2>
        <p className="mt-2 text-sm text-content-soft">
          Deleting your account permanently removes your profile, your social handles, your collaboration
          requests, your projects and their files, your messages, your notifications and your saved items.
          This cannot be undone.
        </p>
        <h2 className="mt-4 text-base font-bold text-content">What is kept, and for how long</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-content-soft">
          <li>
            <strong>Payment and invoice records</strong> are kept for as long as Indian tax and accounting law
            requires, because they belong to a completed transaction between two parties.
          </li>
          <li>
            <strong>A record that an account was closed</strong> — the date, the account type, the reason you
            chose if you gave one, and totals such as how many projects were completed. It holds no name,
            email address, phone number or handle.
          </li>
        </ul>
        <h2 className="mt-4 text-base font-bold text-content">Before you delete</h2>
        <p className="mt-2 text-sm text-content-soft">
          If you have a project that is still running, finish or cancel it first. That protects the other
          side of the deal, who may have already paid or delivered work.
        </p>
      </section>

      <section className="rounded-2xl border border-hairline bg-surface-muted p-5">
        <h2 className="text-base font-bold text-content">Need help?</h2>
        <p className="mt-2 text-sm text-content-soft">
          If you cannot sign in, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-brand hover:underline">
            {SUPPORT_EMAIL}
          </a>{" "}
          from the address on the account and we will confirm the deletion within two working days.
        </p>
      </section>

      <p className="text-xs text-content-muted">
        See also our{" "}
        <Link href="/legal/privacy" className="font-semibold hover:underline">
          privacy policy
        </Link>
        .
      </p>
    </main>
  );
}
