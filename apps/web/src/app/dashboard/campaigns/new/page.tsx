"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Megaphone } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";

const CATEGORIES = [
  "fashion", "beauty", "tech", "food", "travel", "fitness", "lifestyle", "gaming",
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [followerMin, setFollowerMin] = useState("");
  const [location, setLocation] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [deliveryBy, setDeliveryBy] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const toggleCategory = (cat: string) => {
    setCategories((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Give your campaign a title.");
      return;
    }
    if (description.trim().length < 50 && deliverables.trim().length < 50) {
      toast.error("Add at least 50 characters of description or deliverables.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ campaign: any }>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          deliverables: deliverables.trim(),
          budget_min: budgetMin ? Number(budgetMin) : undefined,
          budget_max: budgetMax ? Number(budgetMax) : undefined,
          follower_min: followerMin ? Number(followerMin) : undefined,
          location: location.trim() || undefined,
          categories,
          platforms,
          delivery_by: deliveryBy || undefined,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });
      if (res.ok && res.data) {
        toast.success("Campaign created! It will be reviewed before going live.");
        router.push(`/dashboard/campaigns/${res.data.campaign.id}`);
      } else {
        toast.error(res.error || "Failed to create campaign");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm font-semibold text-content-muted hover:text-content self-start">
        <ArrowLeft size={16} /> Back
      </button>
      <PageHeader title="New campaign" subtitle="Describe what you need and find the right creator." />

      <Card className="p-5">
        <div className="flex flex-col gap-4">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Summer collection launch" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this campaign about? What are you looking for?" />
          </div>
          <div>
            <Label>Deliverables</Label>
            <Textarea rows={3} value={deliverables} onChange={(e) => setDeliverables(e.target.value)} placeholder="What do you expect from the creator?" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Budget min (₹)</Label>
              <Input type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="5000" />
            </div>
            <div>
              <Label>Budget max (₹)</Label>
              <Input type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} placeholder="25000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Min followers</Label>
              <Input type="number" value={followerMin} onChange={(e) => setFollowerMin(e.target.value)} placeholder="10000" />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Mumbai" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Delivery by</Label>
              <Input type="date" value={deliveryBy} onChange={(e) => setDeliveryBy(e.target.value)} />
            </div>
            <div>
              <Label>Applications close</Label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Categories</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    categories.includes(cat)
                      ? "bg-brand text-white"
                      : "bg-surface-muted text-content-muted hover:text-content"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="brand" size="lg" disabled={saving} onClick={handleSubmit}>
              {saving ? <Loader2 className="animate-spin" /> : <Megaphone />} Create campaign
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
