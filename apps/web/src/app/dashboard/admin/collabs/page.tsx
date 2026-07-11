"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, Search, Send, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, InputGroup } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminCollab {
  id: string;
  status: string;
  message?: string | null;
  budget?: number | string | null;
  created_at: string;
  sender?: { name?: string | null; role?: string } | null;
  receiver?: { name?: string | null; role?: string } | null;
}

export default function AdminCollabsPage() {
  const [collabs, setCollabs] = useState<AdminCollab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchCollabs = async () => {
    try {
      const res = await apiFetch<{ collabs: AdminCollab[] }>("/api/admin/collabs");
      if (!res.ok || !res.data) throw new Error(res.error || "Failed to fetch requests");
      setCollabs(res.data.collabs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollabs();
  }, []);

  const handleStatusOverride = async (collabId: string, status: string) => {
    setActionId(collabId);
    try {
      const res = await apiFetch("/api/admin/collabs", {
        method: "PATCH",
        body: JSON.stringify({ collab_id: collabId, status }),
      });
      if (!res.ok) throw new Error(res.error || "Failed to update");
      await fetchCollabs();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setActionId(null);
    }
  };

  const handleDeleteRequest = async (collabId: string) => {
    setActionId(collabId);
    try {
      const res = await apiFetch("/api/admin/collabs", {
        method: "DELETE",
        body: JSON.stringify({ collab_id: collabId }),
      });
      if (!res.ok) throw new Error(res.error || "Failed to delete");
      setConfirmDelete(null);
      await fetchCollabs();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setActionId(null);
    }
  };

  const filtered = collabs.filter(
    (c) =>
      !search ||
      c.sender?.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.receiver?.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.message?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Admin"
        title="Collaboration requests"
        subtitle={`${collabs.length} total — override status or remove requests.`}
        icon={<Send />}
        actions={
          <InputGroup icon={<Search />} className="w-full sm:w-64">
            <Input placeholder="Search requests…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </InputGroup>
        }
      />

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<Send />} title="No requests found" description="No collaboration requests match your search." />
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((c) => {
            const acting = actionId === c.id;
            return (
              <Card key={c.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <Avatar name={c.sender?.name} size="md" square />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-content">{c.sender?.name || "Unknown"}</span>
                      <ArrowRight className="size-3.5 text-content-muted" />
                      <span className="text-sm font-semibold text-content-soft">{c.receiver?.name || "Unknown"}</span>
                      <Badge variant={statusVariant(c.status)} size="sm" dot>
                        {c.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-content-soft">
                      <span className="truncate">{(c.message || "").split("\n")[0] || "No message"}</span>
                      {c.budget != null && c.budget !== "" && (
                        <span className="font-semibold text-content">₹{Number(c.budget).toLocaleString()}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 self-end lg:self-center">
                  {c.status === "pending" && (
                    <>
                      <Button size="sm" className="bg-ok text-white hover:bg-ok/90" disabled={acting} onClick={() => handleStatusOverride(c.id, "accepted")}>
                        Accept
                      </Button>
                      <Button variant="surface" size="sm" className="text-danger" disabled={acting} onClick={() => handleStatusOverride(c.id, "declined")}>
                        Decline
                      </Button>
                    </>
                  )}

                  {confirmDelete === c.id ? (
                    <>
                      <Button size="sm" variant="destructive" disabled={acting} onClick={() => handleDeleteRequest(c.id)}>
                        Confirm
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(c.id)}>
                      <Trash2 /> Delete
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
