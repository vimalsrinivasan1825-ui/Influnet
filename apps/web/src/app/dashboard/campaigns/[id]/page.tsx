"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Calendar, Check, Clock, ExternalLink, MapPin,
  Megaphone, MessageSquare, Users, X, Loader2,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { SOCIAL_PLATFORMS, PLATFORM_LABEL } from "@/lib/social/types";

interface Campaign {
  id: string;
  title: string;
  description: string;
  deliverables: string;
  platforms: string[];
  budget_min: number | null;
  budget_max: number | null;
  starts_on: string | null;
  delivery_by: string | null;
  follower_min: number | null;
  categories: string[];
  location: string | null;
  status: string;
  published_at: string;
  expires_at: string;
  business_user?: { id: string; name: string | null } | null;
}

interface Application {
  id: string;
  pitch: string;
  proposed_rate: number | null;
  status: string;
  created_at: string;
  creator?: { id: string; name: string | null; role?: string } | null;
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [pitch, setPitch] = useState("");
  const [proposedRate, setProposedRate] = useState("");
  const [showApplyForm, setShowApplyForm] = useState(false);

  // Owner-side draft editing + publish/close. The campaign detail page had no
  // way to do either — a draft, once created, had nowhere to go.
  const [showEditForm, setShowEditForm] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDeliverables, setEditDeliverables] = useState("");
  const [editPlatforms, setEditPlatforms] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
        if (profile) setRole((profile as any).role);
      }
      await fetchData();
      setLoading(false);
    })();
  }, [id]);

  const fetchData = async () => {
    const [campRes, appsRes] = await Promise.all([
      apiFetch<{ campaign: Campaign }>(`/api/campaigns/${id}`),
      apiFetch<{ applications: Application[] }>(`/api/campaigns/${id}/applications`),
    ]);
    if (campRes.ok && campRes.data) {
      setCampaign(campRes.data.campaign);
      setEditTitle(campRes.data.campaign.title);
      setEditDescription(campRes.data.campaign.description || "");
      setEditDeliverables(campRes.data.campaign.deliverables || "");
      setEditPlatforms(campRes.data.campaign.platforms || []);
    }
    if (appsRes.ok && appsRes.data) setApplications(appsRes.data.applications || []);
  };

  const toggleEditPlatform = (p: string) => {
    setEditPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const savePublish = async (goLive: boolean) => {
    setPublishing(true);
    try {
      const res = await apiFetch<{ campaign: Campaign }>(`/api/campaigns/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
          deliverables: editDeliverables.trim(),
          platforms: editPlatforms,
          ...(goLive ? { status: "live" } : {}),
        }),
      });
      if (res.ok) {
        toast.success(goLive ? "Campaign published" : "Draft saved");
        setShowEditForm(false);
        await fetchData();
      } else {
        toast.error(res.error || "Could not save the campaign");
      }
    } finally {
      setPublishing(false);
    }
  };

  const closeCampaign = async () => {
    setClosing(true);
    try {
      const res = await apiFetch<{ campaign: Campaign }>(`/api/campaigns/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "closed" }),
      });
      if (res.ok) {
        toast.success("Campaign closed");
        await fetchData();
      } else {
        toast.error(res.error || "Could not close the campaign");
      }
    } finally {
      setClosing(false);
    }
  };

  const handleApply = async () => {
    if (pitch.trim().length < 10) {
      toast.error("Your pitch must be at least 10 characters.");
      return;
    }
    setApplying(true);
    try {
      const res = await apiFetch<{ application: Application }>(`/api/campaigns/${id}/applications`, {
        method: "POST",
        body: JSON.stringify({
          pitch: pitch.trim(),
          proposed_rate: proposedRate ? Number(proposedRate) : undefined,
        }),
      });
      if (res.ok) {
        toast.success("Application submitted!");
        setShowApplyForm(false);
        setPitch("");
        setProposedRate("");
        await fetchData();
      } else {
        toast.error(res.error || "Failed to submit application");
      }
    } finally {
      setApplying(false);
    }
  };

  const handleApplicationAction = async (appId: string, action: "shortlist" | "decline" | "withdraw" | "accept") => {
    try {
      const res = await apiFetch<{ application: Application; conversation_id?: string | null }>(
        `/api/campaigns/${id}/applications/${appId}`,
        { method: "PATCH", body: JSON.stringify({ action }) },
      );
      if (res.ok) {
        if (action === "accept" && res.data?.conversation_id) {
          toast.success("Application accepted — opening the conversation");
          router.push(`/dashboard/messages?conv=${res.data.conversation_id}`);
          return;
        }
        toast.success(`Application ${action}ed`);
        await fetchData();
      } else {
        toast.error(res.error || "Failed to update application");
      }
    } catch {
      toast.error("Something went wrong");
    }
  };

  const isOwner = campaign?.business_user?.id === userId;
  const hasApplied = applications.some((a) => a.creator?.id === userId);
  const myApplication = applications.find((a) => a.creator?.id === userId);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <EmptyState icon={<Megaphone />} title="Campaign not found" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm font-semibold text-content-muted hover:text-content self-start">
        <ArrowLeft size={16} /> Back
      </button>

      <PageHeader title={campaign.title} subtitle={`By ${campaign.business_user?.name || "Brand"}`} />

      {/* Campaign details */}
      <Card className="p-5">
        {campaign.description && <p className="text-sm text-content-soft mb-4">{campaign.description}</p>}
        {campaign.deliverables && (
          <div className="mb-4">
            <span className="text-xs font-bold uppercase text-content-muted">Deliverables</span>
            <p className="text-sm text-content">{campaign.deliverables}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-3 text-xs text-content-muted">
          {campaign.budget_min != null && <span>From ₹{campaign.budget_min.toLocaleString()}</span>}
          {campaign.delivery_by && (
            <span className="flex items-center gap-1">
              <Calendar size={12} /> Delivery by {new Date(campaign.delivery_by).toLocaleDateString("en-IN")}
            </span>
          )}
          {campaign.location && <span className="flex items-center gap-1"><MapPin size={12} /> {campaign.location}</span>}
          {campaign.follower_min && <span className="flex items-center gap-1"><Users size={12} /> {campaign.follower_min.toLocaleString()}+ followers</span>}
        </div>
        {campaign.categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {campaign.categories.map((c) => (
              <span key={c} className="rounded-md bg-surface-muted px-2 py-0.5 text-xs font-semibold text-content-muted">{c}</span>
            ))}
          </div>
        )}
      </Card>

      {/* Owner controls: this campaign's whole lifecycle — draft, live, closed — used
          to have no UI at all past creation. A draft had nowhere to go. */}
      {isOwner && (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-extrabold text-content">
              Status: <Badge variant={campaign.status === "live" ? "success" : campaign.status === "closed" ? "neutral" : "neutral"}>{campaign.status}</Badge>
            </span>
            <div className="flex gap-2">
              {campaign.status === "draft" && (
                <Button variant="surface" size="sm" onClick={() => setShowEditForm((v) => !v)}>
                  {showEditForm ? "Cancel" : "Edit brief"}
                </Button>
              )}
              {campaign.status === "draft" && !showEditForm && (
                <Button variant="brand" size="sm" disabled={publishing} onClick={() => savePublish(true)}>
                  {publishing ? <Loader2 className="animate-spin" /> : null} Publish
                </Button>
              )}
              {campaign.status === "live" && (
                <Button variant="surface" size="sm" disabled={closing} onClick={closeCampaign}>
                  {closing ? <Loader2 className="animate-spin" /> : null} Close campaign
                </Button>
              )}
            </div>
          </div>

          {showEditForm && (
            <div className="flex flex-col gap-3 border-t border-hairline pt-4">
              <div>
                <Label>Title</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
              </div>
              <div>
                <Label>Deliverables</Label>
                <Textarea rows={2} value={editDeliverables} onChange={(e) => setEditDeliverables(e.target.value)} />
              </div>
              <div>
                <Label>Platforms *</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {SOCIAL_PLATFORMS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => toggleEditPlatform(p)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        editPlatforms.includes(p) ? "bg-brand text-white" : "bg-surface-muted text-content-muted hover:text-content"
                      }`}
                    >
                      {PLATFORM_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="surface" size="sm" disabled={publishing} onClick={() => savePublish(false)}>
                  Save draft
                </Button>
                <Button variant="brand" size="sm" disabled={publishing} onClick={() => savePublish(true)}>
                  {publishing ? <Loader2 className="animate-spin" /> : null} Save &amp; publish
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Apply button for creators */}
      {role === "influencer" && !isOwner && !hasApplied && (
        <div>
          {!showApplyForm ? (
            <Button variant="brand" onClick={() => setShowApplyForm(true)}>Apply to this campaign</Button>
          ) : (
            <Card className="p-5">
              <h3 className="text-sm font-extrabold text-content mb-3">Your application</h3>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-bold text-content-muted">Pitch</label>
                  <Textarea
                    rows={3}
                    value={pitch}
                    onChange={(e) => setPitch(e.target.value)}
                    placeholder="Why are you a good fit for this campaign?"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-content-muted">Proposed rate (₹, optional)</label>
                  <Input
                    type="number"
                    value={proposedRate}
                    onChange={(e) => setProposedRate(e.target.value)}
                    placeholder="Your rate"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="surface" size="sm" onClick={() => setShowApplyForm(false)}>Cancel</Button>
                  <Button variant="brand" size="sm" disabled={applying} onClick={handleApply}>
                    {applying ? <Loader2 className="animate-spin" /> : null} Submit
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Application status for creator */}
      {myApplication && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-content">Your application: <Badge variant={myApplication.status === "shortlisted" ? "success" : "neutral"}>{myApplication.status}</Badge></span>
            {myApplication.status === "applied" && (
              <Button variant="surface" size="sm" onClick={() => handleApplicationAction(myApplication.id, "withdraw")}>
                Withdraw
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Applications list for owner */}
      {isOwner && (
        <div>
          <h3 className="text-sm font-extrabold text-content mb-3">Applications ({applications.length})</h3>
          {applications.length === 0 ? (
            <Card><EmptyState icon={<Users />} title="No applications yet" description="Creators will appear here when they apply." /></Card>
          ) : (
            <div className="flex flex-col gap-3">
              {applications.map((app) => (
                <Card key={app.id} className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-content">{app.creator?.name || "Creator"}</span>
                        <Badge variant={app.status === "shortlisted" ? "success" : app.status === "declined" ? "danger" : "neutral"} size="sm">{app.status}</Badge>
                      </div>
                      <p className="text-sm text-content-soft mt-1">{app.pitch}</p>
                      {app.proposed_rate && <span className="text-xs text-content-muted">Rate: ₹{app.proposed_rate.toLocaleString()}</span>}
                    </div>
                    {(app.status === "applied" || app.status === "shortlisted") && (
                      <div className="flex gap-2 shrink-0">
                        {app.status === "applied" && (
                          <>
                            <Button variant="surface" size="sm" onClick={() => handleApplicationAction(app.id, "decline")}>
                              <X size={14} /> Decline
                            </Button>
                            <Button variant="surface" size="sm" onClick={() => handleApplicationAction(app.id, "shortlist")}>
                              <Check size={14} /> Shortlist
                            </Button>
                          </>
                        )}
                        <Button variant="brand" size="sm" onClick={() => handleApplicationAction(app.id, "accept")}>
                          <MessageSquare size={14} /> Accept &amp; message
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
