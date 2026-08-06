"use client";

/**
 * One social handle field: brand mark, input, and an explicit Connect button.
 *
 * Connect is a button and not a debounce because the lookup behind it is a
 * billed provider call. Typing "mycreator" used to fire several of them at
 * whatever moments the user happened to pause; now it fires exactly one, when
 * the user says the handle is finished.
 *
 * Once connected, the field shows the account it actually found — avatar, name,
 * follower count — because that is the only way a creator can tell they typed
 * their own handle and not a squatter's. Editing the handle drops that card
 * (see useSocialConnect), so what's shown always describes what's in the box.
 */

import { AlertCircle, Check, Loader2, Lock, RefreshCw, Search } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { SOCIAL_MARKS, type SocialMarkName } from "@/components/icons/social";
import type { SocialConnectResult } from "@/lib/hooks/use-availability";
import { cn } from "@/lib/utils";

const PLATFORM_LABEL: Record<SocialMarkName, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  twitter: "X (Twitter)",
  snapchat: "Snapchat",
};

export interface SocialConnectFieldProps {
  platform: SocialMarkName;
  value: string;
  onChange: (value: string) => void;
  connect: SocialConnectResult;
  placeholder?: string;
  optional?: boolean;
  /** Extra blocking message from a separate check (e.g. handle already claimed on Influnet). */
  blockingMessage?: string | null;
  helper?: string;
  /**
   * Link-only platforms (Snapchat) render without a Connect button — there is
   * nothing to look up, and a button that can only fail is worse than none.
   */
  linkOnly?: boolean;
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function SocialConnectField({
  platform,
  value,
  onChange,
  connect,
  placeholder,
  optional,
  blockingMessage,
  helper,
  linkOnly,
}: SocialConnectFieldProps) {
  const Mark = SOCIAL_MARKS[platform];
  const clean = value.replace(/^@/, "").trim();
  const { status, profile, message } = connect;

  const busy = status === "checking";
  const connected = status === "connected";
  const failed = status === "private" || status === "notfound" || status === "invalid";

  return (
    <div>
      <Label className="flex items-center gap-1.5">
        <Mark size={14} />
        {PLATFORM_LABEL[platform]}
        {optional && <span className="font-normal normal-case text-content-muted">(optional)</span>}
      </Label>

      {/* Connect sits BELOW the input rather than beside it. Side by side, the
          two split the column between them — on a phone-width viewport the
          handle scrolled out of view as it was typed, and the button was the
          narrowest thing on a step whose whole job is getting it pressed. */}
      <div className="flex flex-col gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/^@/, ""))}
          placeholder={placeholder ?? "username"}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!clean && (failed || !!blockingMessage)}
          // Enter is how people finish a text field; making it submit the
          // lookup means the button is a shortcut, not a toll gate.
          onKeyDown={(e) => {
            if (e.key === "Enter" && !linkOnly && clean && !busy) {
              e.preventDefault();
              connect.connect();
            }
          }}
        />
        {!linkOnly && (
          <button
            type="button"
            onClick={connect.connect}
            disabled={!clean || busy}
            className={cn(
              "inline-flex h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors",
              connected
                ? "border-hairline-strong bg-surface-muted text-content-soft hover:border-content-muted"
                : "border-brand bg-brand-soft text-brand-strong hover:bg-brand-soft/80",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Checking…
              </>
            ) : connected ? (
              <>
                <RefreshCw className="size-3.5" /> Recheck
              </>
            ) : (
              <>
                <Search className="size-3.5" /> Connect
              </>
            )}
          </button>
        )}
      </div>

      {/* The account we actually found. Shown only on success — a card with
          blank fields would suggest we verified something we didn't. */}
      {connected && profile && (
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- provider CDN host, not in next.config images
            <img
              src={profile.avatarUrl}
              alt=""
              className="size-9 shrink-0 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted">
              <Mark size={18} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-content">
              {profile.displayName || `@${clean}`}
            </p>
            <p className="truncate text-xs text-content-soft">
              @{clean}
              {profile.followerCount != null && ` · ${formatFollowers(profile.followerCount)} followers`}
            </p>
          </div>
          <Check className="size-4 shrink-0 text-emerald-500" />
        </div>
      )}

      {/* Status line. Blocking checks (already claimed on Influnet) win over the
          lookup result — that one can't be fixed by rechecking. */}
      {(blockingMessage || (!!clean && status !== "idle")) && (
        <p
          className={cn(
            "mt-1.5 flex items-center gap-1.5 text-xs font-semibold",
            blockingMessage || failed ? "text-danger" : connected ? "text-emerald-600" : "text-content-muted",
          )}
        >
          {blockingMessage ? (
            <>
              <AlertCircle className="size-3.5" /> {blockingMessage}
            </>
          ) : status === "private" ? (
            <>
              <Lock className="size-3.5" />
              This account is private — make it public so brands (and we) can see it
            </>
          ) : status === "notfound" ? (
            <>
              <AlertCircle className="size-3.5" />
              We couldn&apos;t find that {PLATFORM_LABEL[platform]} account
            </>
          ) : status === "invalid" ? (
            <>
              <AlertCircle className="size-3.5" />
              That doesn&apos;t look like a {PLATFORM_LABEL[platform]} username
            </>
          ) : status === "unsupported" ? (
            <>We&apos;ll link this on your profile — {PLATFORM_LABEL[platform]} has no public stats to read</>
          ) : status === "error" ? (
            <>
              <AlertCircle className="size-3.5" />
              {message || `Couldn't reach ${PLATFORM_LABEL[platform]} — try again in a moment`}
            </>
          ) : null}
        </p>
      )}

      {helper && !connected && <p className="mt-1 text-xs text-content-muted">{helper}</p>}
    </div>
  );
}
