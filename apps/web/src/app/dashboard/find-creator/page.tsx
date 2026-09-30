"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Link2, Search, UserRoundSearch } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { resolveLookupUsername } from "@/lib/search-query";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, InputGroup } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { CreatorProfileOverlay } from "@/components/dashboard/creator-profile-overlay";
import type { UserRole } from "@/types";

/**
 * Reach a creator you already know.
 *
 * ── Why this is not a search box ──────────────────────────────────────────
 * Influnet deliberately does not publish a browsable roster of creators. This
 * resolves ONE username, or a pasted profile link, to ONE creator — and
 * answers "no creator with that username" for everything else. There are no
 * suggestions, no partial matches and no results-as-you-type, and all three
 * omissions are the feature rather than an unfinished state.
 *
 * That shape is why the lookup runs on SUBMIT rather than on keystroke. A box
 * that answers while you type teaches people to explore it, which is a
 * directory by another name; one that answers when you ask teaches them to
 * arrive with a username, which is the intended flow.
 *
 * `resolveLookupUsername` is the same resolver the API uses, called here only
 * to explain a bad input BEFORE spending a request on it — the server resolves
 * independently and is the one that decides.
 */
type Result = {
  user_id: string;
  username: string;
  headline: string | null;
  profile: { name: string; location: string | null };
};

type Outcome =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "found"; creator: Result }
  | { kind: "missing"; username: string }
  | { kind: "unparseable" }
  | { kind: "error" };

export default function FindCreatorPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [term, setTerm] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setRoleLoading(false);
        return;
      }
      // `role` is one of the few columns `authenticated` holds a grant on —
      // naming any other here would fail the whole statement with 42501.
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();
      setRole(((data as { role: UserRole } | null)?.role) ?? null);
      setRoleLoading(false);
    })();
  }, []);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const username = resolveLookupUsername(term);
    if (!username) {
      setOutcome({ kind: "unparseable" });
      return;
    }
    setOutcome({ kind: "searching" });
    const res = await apiFetch<{ results: Result[] }>(
      `/api/discover?q=${encodeURIComponent(username)}`,
    );
    if (!res.ok) {
      setOutcome({ kind: "error" });
      return;
    }
    const creator = res.data?.results?.[0];
    setOutcome(creator ? { kind: "found", creator } : { kind: "missing", username });
  }

  if (roleLoading) return null;

  if (role !== "business_owner") {
    return (
      <div className="space-y-5">
        <PageHeader title="Find creator" icon={<UserRoundSearch className="size-5" />} />
        <EmptyState
          title="For business accounts"
          description="Looking a creator up is something brands do. Your account collaborates through requests and projects instead."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Find creator"
        icon={<UserRoundSearch className="size-5" />}
        subtitle="Enter a creator's username or paste their Influnet profile link."
      />

      <Card className="max-w-2xl p-5">
        <form onSubmit={lookup} className="flex flex-col gap-3 sm:flex-row">
          <InputGroup icon={<AtSign className="size-4" />} className="flex-1">
            <Input
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                if (outcome.kind !== "idle") setOutcome({ kind: "idle" });
              }}
              placeholder="username or influnet.io/username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Creator username or profile link"
            />
          </InputGroup>
          <Button type="submit" disabled={!term.trim() || outcome.kind === "searching"}>
            <Search className="size-4" />
            {outcome.kind === "searching" ? "Looking up…" : "Look up"}
          </Button>
        </form>

        <p className="mt-3 flex items-center gap-1.5 text-xs text-content-muted">
          <Link2 className="size-3.5 shrink-0" aria-hidden />
          This is an exact lookup — it finds the one creator with that username,
          and does not suggest others.
        </p>
      </Card>

      {outcome.kind === "unparseable" && (
        <Card className="max-w-2xl p-5">
          <p className="text-sm text-content-soft">
            That is not a username or an Influnet profile link. Try{" "}
            <span className="font-medium text-content">theirusername</span> or{" "}
            <span className="font-medium text-content">influnet.io/theirusername</span>.
          </p>
        </Card>
      )}

      {outcome.kind === "missing" && (
        <Card className="max-w-2xl p-5">
          <p className="text-sm text-content-soft">
            No creator with the username{" "}
            <span className="font-medium text-content">@{outcome.username}</span>.
            Check the spelling, or ask them for their profile link.
          </p>
        </Card>
      )}

      {outcome.kind === "error" && (
        <Card className="max-w-2xl p-5">
          <p className="text-sm text-content-soft">
            We could not complete that lookup. Try again in a moment.
          </p>
        </Card>
      )}

      {outcome.kind === "found" && (
        <Card className="max-w-2xl p-5">
          <div className="flex items-center gap-3">
            <Avatar name={outcome.creator.profile.name} size="lg" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold text-content">
                {outcome.creator.profile.name}
              </h3>
              <p className="truncate text-sm text-content-muted">
                @{outcome.creator.username}
                {outcome.creator.profile.location ? ` · ${outcome.creator.profile.location}` : ""}
              </p>
              {outcome.creator.headline && (
                <p className="mt-1 truncate text-sm text-content-soft">
                  {outcome.creator.headline}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setPreview(outcome.creator.username)}>View profile</Button>
            <Button
              variant="outline"
              onClick={() =>
                router.push(`/dashboard/requests/new?to=${outcome.creator.user_id}`)
              }
            >
              Send a request
            </Button>
          </div>
        </Card>
      )}

      <CreatorProfileOverlay username={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
