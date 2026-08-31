"use client";

import { useState } from "react";
import { Globe, Lock, Mail, Phone, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useEntitlements } from "@/lib/hooks/use-entitlements";

interface Contact {
  name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

/**
 * "Show contact details" for a creator viewing a brand it has a relationship
 * with. Free reveals 5 businesses lifetime; the server (migration 141) is the
 * authority — this only renders the button and what it gets back.
 */
export function BusinessContactReveal({ username }: { username: string }) {
  const { entitlements, isPro } = useEntitlements();
  const [contact, setContact] = useState<Contact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cap =
    entitlements?.subscriptionsEnabled && typeof entitlements.limits.contactReveals === "number"
      ? entitlements.limits.contactReveals
      : null;
  const used = entitlements?.usage.contactReveals ?? 0;

  async function reveal() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ contact: Contact }>(
      `/api/businesses/${encodeURIComponent(username)}/reveal-contact`,
      { method: "POST" },
    );
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not load contact details.");
      return;
    }
    setContact(res.data.contact);
  }

  if (contact) {
    const empty = !contact.name && !contact.phone && !contact.email && !contact.website;
    return (
      <div className="mt-4 border-t border-hairline pt-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-content-muted">Contact</p>
        {empty ? (
          <p className="text-sm text-content-muted">This brand hasn&apos;t added contact details yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {contact.name && <li className="font-semibold text-content">{contact.name}</li>}
            {contact.phone && (
              <li>
                <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-brand hover:underline">
                  <Phone className="size-3.5" /> {contact.phone}
                </a>
              </li>
            )}
            {contact.email && (
              <li>
                <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-brand hover:underline">
                  <Mail className="size-3.5" /> {contact.email}
                </a>
              </li>
            )}
            {contact.website && (
              <li>
                <a
                  href={contact.website.startsWith("http") ? contact.website : `https://${contact.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-brand hover:underline"
                >
                  <Globe className="size-3.5" /> {contact.website.replace(/^https?:\/\//, "")}
                </a>
              </li>
            )}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-hairline pt-4">
      <p className="text-sm text-content-soft">
        See this brand&apos;s direct phone and email.
        {cap !== null && !isPro && ` Free reveals ${used}/${cap} used.`}
      </p>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <button
        onClick={reveal}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm font-semibold text-content hover:bg-hairline disabled:opacity-60"
      >
        {cap !== null && !isPro && used >= cap ? <Sparkles className="size-4" /> : <Lock className="size-4" />}
        {busy ? "Loading…" : "Show contact details"}
      </button>
    </div>
  );
}
