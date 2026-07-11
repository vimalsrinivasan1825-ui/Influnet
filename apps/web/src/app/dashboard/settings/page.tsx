"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, ExternalLink, Loader2, Save } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";

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
        setCompanyName(p.company_name || "");
        setIndustry(p.industry || "");
        setBio(p.bio || "");
        setUsername(p.username || "");
        setHeadline(p.headline || "");
        setInstagram(p.instagram_handle || "");
        setYoutube(p.youtube_handle || "");
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
      const payload: Record<string, string> = { name, phone, location };
      if (profile?.role === "business_owner") {
        payload.company_name = companyName;
        payload.industry = industry;
        if (username) payload.username = username;
      } else if (profile?.role === "influencer") {
        payload.bio = bio;
        payload.headline = headline;
        if (username) payload.username = username;
        payload.instagram_handle = instagram;
        payload.youtube_handle = youtube;
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

      <SectionCard title="Profile information">
        <div className="flex flex-col gap-4">
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
              <a
                href={`/b/${profile.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-strong"
              >
                Public profile <ExternalLink className="size-3.5" />
              </a>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Platform username" hint={`Public URL: influnet.app/b/${username || "yourusername"}`}>
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
              <a
                href={`/c/${profile.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-strong"
              >
                Public profile <ExternalLink className="size-3.5" />
              </a>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Platform username" hint={`Public URL: influnet.app/c/${username || "yourusername"}`}>
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
    </div>
  );
}
