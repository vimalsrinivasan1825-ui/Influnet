"use client";
import { toast } from "sonner";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ExternalLink, Loader2, Plus, Save, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { uploadToCloudinary } from "@/lib/storage/upload-client";
import { VerificationPanel } from "@/components/dashboard/verification-panel";
import { BlockedAccountsPanel } from "@/components/dashboard/blocked-accounts-panel";
import { EmailPreferencesPanel } from "@/components/dashboard/email-preferences-panel";
import { InstagramOwnershipPanel } from "@/components/dashboard/instagram-ownership-panel";
import { PortfolioEditor } from "@/components/dashboard/portfolio-editor";
import { ProfileVisibilityEditor } from "@/components/dashboard/profile-visibility-editor";
import { publicProfileUrlDisplay } from "@/lib/site";

type Slice = { label: string; pct: number };
type SliceRow = { label: string; pct: string };

interface AudienceDemographics {
  locations?: Slice[];
  age?: Slice[];
  gender?: Slice[];
}

interface Profile {
  role?: string;
  email?: string;
  name?: string;
  username?: string;
  phone?: string;
  location?: string;
  company_name?: string;
  industry?: string;
  bio?: string;
  headline?: string;
  instagram_handle?: string;
  youtube_handle?: string;
  pricing_min?: number | null;
  pricing_max?: number | null;
  past_collaborations?: unknown[] | null;
  audience_demographics?: AudienceDemographics | null;
  // Undefined = migration 088 not applied; {} = applied with everything on.
  profile_section_visibility?: Record<string, boolean> | null;
  avatar_url?: string;
  logo_url?: string;
  cover_image_url?: string;
}

// Stored slices may arrive as {label,pct} objects; map to editable string rows.
function toRows(slices: unknown): SliceRow[] {
  if (!Array.isArray(slices)) return [];
  return slices
    .map((s): SliceRow => ({
      label: String((s as any)?.label ?? ""),
      pct: (s as any)?.pct != null ? String((s as any).pct) : "",
    }))
    .filter((r) => r.label);
}

// Editable rows → clean {label,pct} slices (drop blanks / non-numeric).
function fromRows(rows: SliceRow[]): Slice[] {
  return rows
    .map((r) => ({ label: r.label.trim(), pct: Number(r.pct) }))
    .filter((s) => s.label && Number.isFinite(s.pct))
    .map((s) => ({ label: s.label, pct: Math.max(0, Math.min(100, Math.round(s.pct))) }));
}

// past_collaborations may be strings or {brand|name} objects → display names.
function collabNames(raw: unknown[] | null | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c: any) => (typeof c === "string" ? c : c?.brand ?? c?.name ?? ""))
    .map((s: string) => s.trim())
    .filter(Boolean);
}

function SliceEditor({
  label,
  hint,
  placeholder,
  rows,
  onChange,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  rows: SliceRow[];
  onChange: (rows: SliceRow[]) => void;
}) {
  const set = (i: number, patch: Partial<SliceRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={row.label}
              onChange={(e) => set(i, { label: e.target.value })}
              placeholder={placeholder}
              className="flex-1"
            />
            <Input
              value={row.pct}
              onChange={(e) => set(i, { pct: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) })}
              placeholder="%"
              className="w-20"
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              aria-label="Remove"
              className="p-2 text-content-muted hover:text-danger"
              title="Remove"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        {rows.length < 12 && (
          <button
            type="button"
            onClick={() => onChange([...rows, { label: "", pct: "" }])}
            className="flex items-center gap-1 self-start text-sm font-semibold text-brand hover:text-brand-strong"
          >
            <Plus size={14} /> Add row
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-content-muted">{hint}</p>}
    </div>
  );
}

function ImageUploadField({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await uploadToCloudinary(file, 'profile');
      onChange(url);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-4">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={label} className="size-16 rounded-xl object-cover border border-hairline shadow-sm bg-surface-muted" />
        ) : (
          <div className="size-16 rounded-xl bg-surface-muted border border-hairline flex items-center justify-center text-content-muted shadow-sm">
            <Plus size={24} />
          </div>
        )}
        <div>
          <label className="relative cursor-pointer rounded-lg bg-surface px-3 py-1.5 text-sm font-semibold text-content border border-hairline hover:bg-surface-muted transition-colors">
            {busy ? <Loader2 size={16} className="animate-spin inline mr-2" /> : null}
            {busy ? 'Uploading...' : 'Change image'}
            <input type="file" className="hidden" accept="image/*" onChange={handleUpload} disabled={busy} />
          </label>
        </div>
      </div>
    </Field>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-content-muted">{hint}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [bio, setBio] = useState("");
  const [headline, setHeadline] = useState("");
  const [instagram, setInstagram] = useState("");
  const [youtube, setYoutube] = useState("");
  
  const [avatarUrl, setAvatarUrl] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");

  // Media-kit fields (influencer)
  const [pricingMin, setPricingMin] = useState("");
  const [pricingMax, setPricingMax] = useState("");
  const [pastCollabs, setPastCollabs] = useState("");
  const [locations, setLocations] = useState<SliceRow[]>([]);
  const [ages, setAges] = useState<SliceRow[]>([]);
  const [genders, setGenders] = useState<SliceRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ profile: Profile }>("/api/profile");
        if (!res.ok || !res.data) throw new Error(res.error || "Failed to load profile");
        const p = res.data.profile;
        setProfile(p);
        setName(p.name || "");
        setPhone(p.phone || "");
        setLocation(p.location || "");
        setAvatarUrl((p.role === "business_owner" ? p.logo_url : p.avatar_url) || "");
        setCoverImageUrl(p.cover_image_url || "");
        setCompanyName(p.company_name || "");
        setIndustry(p.industry || "");
        setBio(p.bio || "");
        setUsername(p.username || "");
        setHeadline(p.headline || "");
        setInstagram(p.instagram_handle || "");
        setYoutube(p.youtube_handle || "");
        setPricingMin(p.pricing_min != null ? String(p.pricing_min) : "");
        setPricingMax(p.pricing_max != null ? String(p.pricing_max) : "");
        setPastCollabs(collabNames(p.past_collaborations).join("\n"));
        const ad = (p.audience_demographics || {}) as AudienceDemographics;
        setLocations(toRows(ad.locations));
        setAges(toRows(ad.age));
        setGenders(toRows(ad.gender));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSuccess("");
    setError("");
    try {
      const payload: Record<string, unknown> = { name, phone, location };
      if (profile?.role === "business_owner") {
        payload.company_name = companyName;
        payload.industry = industry;
        if (avatarUrl) payload.logo_url = avatarUrl;
        if (coverImageUrl) payload.cover_image_url = coverImageUrl;
        if (username) payload.username = username;
      } else if (profile?.role === "influencer") {
        payload.bio = bio;
        payload.headline = headline;
        if (avatarUrl) payload.avatar_url = avatarUrl;
        if (coverImageUrl) payload.cover_image_url = coverImageUrl;
        if (username) payload.username = username;
        payload.instagram_handle = instagram;
        payload.youtube_handle = youtube;
        // Media-kit fields. Only send pricing when it parses to a number so we
        // don't wipe a saved value with an empty string.
        const pmin = Number(pricingMin);
        const pmax = Number(pricingMax);
        if (pricingMin.trim() && Number.isFinite(pmin)) payload.pricing_min = pmin;
        if (pricingMax.trim() && Number.isFinite(pmax)) payload.pricing_max = pmax;
        payload.past_collaborations = pastCollabs
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 24);
        payload.audience_demographics = {
          locations: fromRows(locations),
          age: fromRows(ages),
          gender: fromRows(genders),
        };
      }

      const res = await apiFetch("/api/profile", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(res.error || "Failed to save");

      const stored = localStorage.getItem("influnet_user");
      if (stored) {
        const user = JSON.parse(stored);
        user.name = name;
        localStorage.setItem("influnet_user", JSON.stringify(user));
      }

      setSuccess("Profile updated.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("Are you sure you want to completely delete your account? This will instantly wipe all your data from the database and cannot be undone.")) {
      return;
    }
    setDeleting(true);
    setError("");
    try {
      const res = await apiFetch("/api/profile", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(res.error || "Failed to delete account");
      
      localStorage.removeItem("influnet_user");
      window.location.href = "/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const isBusiness = profile?.role === "business_owner";
  const isInfluencer = profile?.role === "influencer";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Account settings"
        subtitle="Manage your profile and public presence."
      />

      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-ok/20 bg-ok-soft px-4 py-3 text-sm font-semibold text-ok">
          <Check className="size-4" /> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
          <AlertTriangle className="size-4" /> {error}
        </div>
      )}

      {(isBusiness || isInfluencer) && <VerificationPanel />}

      {isInfluencer && profile?.instagram_handle && (
        <InstagramOwnershipPanel
          handle={profile.instagram_handle}
          username={username || profile?.username}
          name={name || profile?.name}
        />
      )}

      <SectionCard title="Profile information">
        <div className="flex flex-col gap-4">
          <ImageUploadField label="Profile picture" hint="Used as your avatar on Influnet." value={avatarUrl} onChange={setAvatarUrl} />
          <ImageUploadField label="Public profile image" hint="Cover image shown on your public page or media kit." value={coverImageUrl} onChange={setCoverImageUrl} />
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Email" hint="Email can't be changed.">
            <Input value={profile?.email || ""} disabled />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" />
          </Field>
        </div>
      </SectionCard>

      {isBusiness && (
        <SectionCard
          title="Business details"
          action={
            profile?.username ? (
              <Link
                href={`/b/${profile.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-strong"
              >
                Public profile <ExternalLink className="size-3.5" />
              </Link>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Platform username" hint={`Public URL: ${publicProfileUrlDisplay(username || "yourusername")}`}>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="yourusername"
              />
            </Field>
            <Field label="Company name">
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Your company" />
            </Field>
            <Field label="Industry">
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Fashion, Tech, Food" />
            </Field>
          </div>
        </SectionCard>
      )}

      {isInfluencer && (
        <SectionCard
          title="Creator profile"
          action={
            profile?.username ? (
              <Link
                href={`/${profile.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-strong"
              >
                Public profile <ExternalLink className="size-3.5" />
              </Link>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Platform username" hint={`Public URL: ${publicProfileUrlDisplay(username || "yourusername")}`}>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="yourusername"
              />
            </Field>
            <Field label="Headline">
              <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. Fitness creator · 50K followers" />
            </Field>
            <Field label="Bio">
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell brands about yourself…" rows={3} />
            </Field>
            <Field label="Instagram handle">
              <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@username" />
            </Field>
            <Field label="YouTube channel">
              <Input value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="@channel" />
            </Field>
          </div>
        </SectionCard>
      )}

      {/* Above the media-kit fields: this is what the public profile now leads
          with, so it should be what a creator meets first here too. */}
      {isInfluencer && (
        <ProfileVisibilityEditor initial={profile?.profile_section_visibility ?? undefined} />
      )}
      {isInfluencer && <PortfolioEditor />}

      {isInfluencer && (
        <SectionCard title="Media kit details">
          <div className="flex flex-col gap-5">
            <p className="-mt-1 text-sm text-content-muted">
              Powers your brand-facing media kit. Each section stays hidden until you fill it in.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Rate — from (₹)" hint="Your starting collaboration rate.">
                <Input
                  value={pricingMin}
                  onChange={(e) => setPricingMin(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="5000"
                  inputMode="numeric"
                />
              </Field>
              <Field label="Rate — up to (₹)">
                <Input
                  value={pricingMax}
                  onChange={(e) => setPricingMax(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="25000"
                  inputMode="numeric"
                />
              </Field>
            </div>

            <Field
              label="Past collaborations"
              hint="One brand per line — a plain name wall on your media kit. For work you can actually show, add it under Selected work above instead."
            >
              <Textarea
                value={pastCollabs}
                onChange={(e) => setPastCollabs(e.target.value)}
                placeholder={"Mamaearth\nBoat\nUnacademy"}
                rows={3}
              />
            </Field>

            <SliceEditor
              label="Audience — top locations"
              placeholder="India"
              hint="Add your biggest audience locations and their share (%)."
              rows={locations}
              onChange={setLocations}
            />
            <SliceEditor
              label="Audience — age groups"
              placeholder="25-34"
              rows={ages}
              onChange={setAges}
            />
            <SliceEditor
              label="Audience — gender split"
              placeholder="Female"
              rows={genders}
              onChange={setGenders}
            />
          </div>
        </SectionCard>
      )}

      <div className="flex justify-end">
        <Button variant="brand" size="xl" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save /> Save changes
            </>
          )}
        </Button>
      </div>

      <div className="mt-8">
        <SectionCard eyebrow="Notifications" title="Email preferences">
          <EmailPreferencesPanel />
        </SectionCard>
      </div>

      <div className="mt-8">
        <SectionCard eyebrow="Privacy" title="Blocked accounts" bodyClassName="p-0">
          <BlockedAccountsPanel />
        </SectionCard>
      </div>

      <div className="mt-8">
        <SectionCard title="Danger zone">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-content-muted">
              Permanently delete your account and all associated data. This action cannot be undone.
            </div>
            <Button
              variant="outline"
              className="border-danger/30 text-danger hover:bg-danger-soft hover:text-danger-strong"
              onClick={handleDeleteAccount}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="animate-spin mr-2 size-4" /> Deleting…
                </>
              ) : (
                "Delete account"
              )}
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
