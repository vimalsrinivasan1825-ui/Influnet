"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Mail,
  Monitor,
  RefreshCw,
  Send,
  Smartphone,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, THead, TRow } from "@/components/ui/table";

/**
 * Admin email console — preview every template with editable data and send a
 * real one to any address.
 *
 * The preview renders server-side HTML inside a sandboxed iframe rather than
 * into the page: email HTML is a full document with its own <html>/<body> and
 * inline styles, and injecting that into the dashboard would fight the app's
 * own CSS and show you something that is not what lands in the inbox.
 */

interface TemplateInfo {
  id: string;
  label: string;
  description: string;
  tier: "account" | "activity" | "marketing";
  category: string;
  sample: Record<string, unknown>;
}

interface EmailConfig {
  enabled: boolean;
  apiKeyPresent: boolean;
  from: string;
  replyTo: string;
  appUrl: string | null;
  allowlist: string | null;
  requireVerified: boolean;
  dailyCap: number;
  webhookConfigured: boolean;
  environment: string;
}

interface Delivery {
  id: string;
  to_email: string;
  template: string;
  category: string;
  status: string;
  resend_id: string | null;
  error: string | null;
  created_at: string;
}

const TIER_LABEL: Record<string, string> = {
  account: "Account",
  activity: "Activity",
  marketing: "Marketing",
};

const TIER_VARIANT: Record<string, "brand" | "info" | "neutral"> = {
  account: "brand",
  activity: "info",
  marketing: "neutral",
};

const STATUS_VARIANT: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  sent: "success",
  delivered: "success",
  pending: "warning",
  skipped: "neutral",
  failed: "danger",
  bounced: "danger",
  complained: "danger",
};

export default function AdminEmailsPage() {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [recent, setRecent] = useState<Delivery[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selectedId, setSelectedId] = useState<string>("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const load = useCallback(async () => {
    const res = await apiFetch<{ templates: TemplateInfo[]; config: EmailConfig; recent: Delivery[] | null }>(
      "/api/admin/emails",
    );
    if (!res.ok || !res.data) {
      setLoadError(res.error || "Failed to load the email console");
      setLoading(false);
      return;
    }
    setTemplates(res.data.templates);
    setConfig(res.data.config);
    setRecent(res.data.recent);
    setSelectedId((current) => current || res.data!.templates[0]?.id || "");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset the editable fields whenever a different template is picked.
  useEffect(() => {
    if (!selected) return;
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(selected.sample)) {
      next[key] = value == null ? "" : String(value);
    }
    setFields(next);
    setSendResult(null);
  }, [selected]);

  // Re-render the preview as the fields change. Debounced so typing a name
  // doesn't fire a request per keystroke.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!selected) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setPreviewing(true);
      const res = await apiFetch<{ subject: string; html: string }>("/api/admin/emails", {
        method: "POST",
        body: JSON.stringify({ action: "preview", templateId: selected.id, data: coerce(fields, selected.sample) }),
      });
      if (res.ok && res.data) setPreview(res.data);
      setPreviewing(false);
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [selected, fields]);

  async function handleSend() {
    if (!selected) return;
    setSending(true);
    setSendResult(null);
    const res = await apiFetch<{ ok: boolean; id: string | null; to: string }>("/api/admin/emails", {
      method: "POST",
      body: JSON.stringify({
        action: "send",
        templateId: selected.id,
        data: coerce(fields, selected.sample),
        to: to.trim(),
      }),
    });
    setSending(false);
    setSendResult(
      res.ok && res.data
        ? { ok: true, message: `Sent to ${res.data.to}${res.data.id ? ` · ${res.data.id}` : ""}` }
        : { ok: false, message: res.error || "Send failed" },
    );
    if (res.ok) void load();
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {loadError}
        </div>
      </div>
    );
  }

  const grouped = groupByTier(templates);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Email"
        title="Email console"
        subtitle="Preview every template with real data and send a test to any address."
        icon={<Mail />}
        actions={
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw /> Refresh
          </Button>
        }
      />

      {config && <ConfigStrip config={config} />}

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Template picker */}
        <SectionCard eyebrow="Templates" title={`${templates.length} available`} bodyClassName="px-2 py-2 sm:px-2">
          <div className="flex max-h-[720px] flex-col gap-3 overflow-y-auto p-1">
            {grouped.map(([tier, items]) => (
              <div key={tier}>
                <p className="px-2 py-1 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-content-muted">
                  {TIER_LABEL[tier] ?? tier}
                </p>
                {items.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                      t.id === selectedId
                        ? "bg-brand-soft font-semibold text-brand-strong"
                        : "text-content-soft hover:bg-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="flex flex-col gap-5">
          {selected && (
            <>
              <SectionCard
                eyebrow={selected.category}
                title={selected.label}
                action={<Badge variant={TIER_VARIANT[selected.tier]}>{TIER_LABEL[selected.tier]}</Badge>}
              >
                <p className="mb-4 text-sm text-content-soft">{selected.description}</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.keys(fields).map((key) => {
                    const long = String(fields[key] ?? "").length > 60;
                    return (
                      <div key={key} className={long ? "sm:col-span-2" : undefined}>
                        <Label htmlFor={`f-${key}`}>{humanize(key)}</Label>
                        {long ? (
                          <Textarea
                            id={`f-${key}`}
                            value={fields[key]}
                            onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                          />
                        ) : (
                          <Input
                            id={`f-${key}`}
                            value={fields[key]}
                            onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 flex flex-col gap-3 border-t border-hairline pt-5 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Label htmlFor="test-to">Send a real test to</Label>
                    <Input
                      id="test-to"
                      type="email"
                      placeholder="you@gmail.com"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </div>
                  <Button variant="brand" size="xl" disabled={sending || !to.trim()} onClick={() => void handleSend()}>
                    {sending ? <Loader2 className="animate-spin" /> : <Send />}
                    {sending ? "Sending…" : "Send test"}
                  </Button>
                </div>

                {sendResult && (
                  <div
                    className={`mt-3 flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
                      sendResult.ok
                        ? "bg-success-soft text-success"
                        : "bg-danger-soft text-danger"
                    }`}
                  >
                    {sendResult.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0" />
                    )}
                    <span>{sendResult.message}</span>
                  </div>
                )}

                <p className="mt-3 text-xs text-content-muted">
                  A test send ignores the recipient&apos;s opt-outs, the daily cap and the dedupe ledger — it always
                  sends. It still obeys <code>NOTIFY_EMAILS_ENABLED</code> and <code>EMAIL_ALLOWLIST</code>.
                </p>
              </SectionCard>

              <SectionCard
                eyebrow="Preview"
                title={preview?.subject || "…"}
                action={
                  <div className="flex items-center gap-1">
                    <Button
                      variant={device === "desktop" ? "brandSoft" : "ghost"}
                      size="icon-sm"
                      onClick={() => setDevice("desktop")}
                      aria-label="Desktop width"
                    >
                      <Monitor />
                    </Button>
                    <Button
                      variant={device === "mobile" ? "brandSoft" : "ghost"}
                      size="icon-sm"
                      onClick={() => setDevice("mobile")}
                      aria-label="Mobile width"
                    >
                      <Smartphone />
                    </Button>
                  </div>
                }
                bodyClassName="bg-muted/40"
              >
                <div className="flex justify-center">
                  <div
                    className="overflow-hidden rounded-xl border border-hairline bg-white transition-all"
                    style={{ width: device === "mobile" ? 380 : "100%", maxWidth: "100%" }}
                  >
                    {preview ? (
                      <iframe
                        title="Email preview"
                        srcDoc={preview.html}
                        // Nothing in an email preview should be able to run
                        // script or navigate the dashboard away.
                        sandbox=""
                        className="h-[720px] w-full border-0"
                      />
                    ) : (
                      <div className="flex h-[720px] items-center justify-center text-sm text-content-muted">
                        {previewing ? "Rendering…" : "No preview"}
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>
            </>
          )}

          <SectionCard eyebrow="Delivery log" title="Last 20 sends">
            {recent === null ? (
              <div className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>
                  Migration <code>098_email_delivery.sql</code> has not been applied to this database yet, so no
                  delivery log, opt-outs, daily cap or dedupe are active. Test sends still work.
                </span>
              </div>
            ) : recent.length === 0 ? (
              <p className="text-sm text-content-muted">Nothing sent yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TRow>
                      <th>When</th>
                      <th>To</th>
                      <th>Template</th>
                      <th>Status</th>
                    </TRow>
                  </THead>
                  <TBody>
                    {recent.map((d) => (
                      <TRow key={d.id}>
                        <td className="whitespace-nowrap text-content-muted">
                          {new Date(d.created_at).toLocaleString()}
                        </td>
                        <td className="max-w-[220px] truncate">{d.to_email}</td>
                        <td className="text-content-soft">{d.template}</td>
                        <td>
                          <Badge variant={STATUS_VARIANT[d.status] ?? "neutral"}>{d.status}</Badge>
                          {d.error && <span className="ml-2 text-xs text-danger">{d.error}</span>}
                        </td>
                      </TRow>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────

function ConfigStrip({ config }: { config: EmailConfig }) {
  const blocked = !config.enabled || !config.apiKeyPresent;
  return (
    <div
      className={`rounded-2xl border px-5 py-4 ${
        blocked ? "border-warning/25 bg-warning-soft" : "border-hairline bg-surface-card"
      }`}
    >
      {blocked && (
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          {!config.apiKeyPresent
            ? "RESEND_API_KEY is not set in this environment — nothing can be sent."
            : "NOTIFY_EMAILS_ENABLED is not \"true\" — sends are suppressed in this environment."}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
        <Row label="Environment" value={config.environment} />
        <Row label="Sending" value={config.enabled ? "enabled" : "disabled"} ok={config.enabled} />
        <Row label="From" value={config.from} />
        <Row label="Reply-To" value={config.replyTo} />
        <Row label="App URL" value={config.appUrl || "not set"} ok={!!config.appUrl} />
        <Row label="Allowlist" value={config.allowlist || "everyone"} />
        <Row label="Daily cap" value={`${config.dailyCap} / user`} />
        <Row
          label="Bounce webhook"
          value={config.webhookConfigured ? "configured" : "not configured"}
          ok={config.webhookConfigured}
        />
      </dl>
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="font-bold uppercase tracking-wide text-content-muted">{label}</dt>
      <dd className={`truncate font-medium ${ok === false ? "text-danger" : "text-content"}`} title={value}>
        {value}
      </dd>
    </div>
  );
}

function groupByTier(templates: TemplateInfo[]): Array<[string, TemplateInfo[]]> {
  const order = ["account", "activity", "marketing"];
  const map = new Map<string, TemplateInfo[]>();
  for (const t of templates) {
    const list = map.get(t.tier) ?? [];
    list.push(t);
    map.set(t.tier, list);
  }
  return order.filter((tier) => map.has(tier)).map((tier) => [tier, map.get(tier)!]);
}

function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/_/g, " ")
    .trim();
}

/**
 * Every form field is a string; the templates expect the shape of their own
 * sample (a rating is a number, a count is a number). Coerce back using the
 * sample as the type reference so `5` doesn't become `"5"` and break
 * `'★'.repeat(rating)`.
 */
function coerce(
  fields: Record<string, string>,
  sample: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const reference = sample[key];
    if (typeof reference === "number") {
      const n = Number(value);
      out[key] = Number.isFinite(n) ? n : reference;
    } else if (typeof reference === "boolean") {
      out[key] = value === "true";
    } else {
      out[key] = value;
    }
  }
  return out;
}
