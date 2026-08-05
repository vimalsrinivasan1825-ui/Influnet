/**
 * Where a creator's verification actually stands, on Home, in one card.
 *
 * Home used to know a single bit — badge or no badge — and rendered one action
 * off it: "Verify your Instagram. Takes about a minute." Someone who had proved
 * their bio link during signup and was waiting on a follower count they cannot
 * change in a minute got that card anyway, pointing at a job already done. It
 * read as "we lost your proof", which is exactly what people reported.
 *
 * Three states, because three genuinely different things can be true:
 *
 *   nothing proven yet  → an ACTION card. There is a task, it is short, say so.
 *   proven, still scoring → this card. Progress and a checklist, no false urgency.
 *   verified            → nothing here at all; VerifiedCelebration marks it once.
 *
 * The checklist is the same one the verification screen shows, trimmed to what
 * fits a glance: everything outstanding first, since that is the only part
 * anyone can act on, then the passes as reassurance. Tapping opens the full
 * screen. Dismissing hides it until the state changes — a checklist you can
 * never put away becomes furniture.
 */
import { Pressable, View } from 'react-native';
import { BadgeCheck, Check, ChevronRight, Clock, X } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Card, ProgressBar, Txt } from '@/components/ui';

export interface VerificationChecklistItem {
  key: string;
  label: string;
  met: boolean;
  /** 0 means "required, but worth no score" — the ownership gate. */
  weight: number;
}

export interface VerificationSummary {
  status: 'unverified' | 'pending' | 'in_review' | 'verified' | 'needs_more_info' | 'rejected';
  badge: boolean;
  ownership_verified: boolean;
  score: number | null;
  threshold: number;
  checked_at: string | null;
  checklist: VerificationChecklistItem[] | null;
}

/** How many passing items to show under the outstanding ones. */
const MAX_MET_SHOWN = 2;

const HEADLINE: Partial<Record<VerificationSummary['status'], { title: string; body: string }>> = {
  in_review: {
    title: 'Verification in review',
    body: 'Your account is with a reviewer. Nothing is blocked while you wait.',
  },
  pending: {
    title: 'Checking your account',
    body: 'This runs in the background — carry on as normal.',
  },
  needs_more_info: {
    title: 'A few things left',
    body: 'Fill these in and run the check again to get verified.',
  },
  rejected: {
    title: 'Verification didn’t pass',
    body: 'Review the points below, then try again.',
  },
  unverified: {
    title: 'Verification not run yet',
    body: 'We check your handle live. It takes a moment and blocks nothing.',
  },
};

export function VerificationStatusCard({
  summary,
  onPress,
  onDismiss,
}: {
  summary: VerificationSummary;
  onPress: () => void;
  onDismiss: () => void;
}) {
  const t = useTheme();
  const copy = HEADLINE[summary.status] ?? HEADLINE.unverified!;

  const checklist = summary.checklist ?? [];
  const unmet = checklist.filter((i) => !i.met);
  const met = checklist.filter((i) => i.met);
  // Outstanding first — that is the actionable half. Passes follow as evidence
  // the work so far was not lost, which is the whole complaint this fixes.
  const shown = [...unmet, ...met.slice(0, MAX_MET_SHOWN)];

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={copy.title}>
      {({ pressed }) => (
        <Card style={{ gap: t.spacing.md, opacity: pressed ? 0.92 : 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.md }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: t.color.verifiedSoft,
              }}
            >
              <Clock size={18} color={t.color.verified} />
            </View>

            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="bodyStrong">{copy.title}</Txt>
              <Txt variant="footnote" tone="muted">
                {copy.body}
              </Txt>
            </View>

            {/* Close, not a chevron: the row is already the tap target for the
                full screen, and this card's job is to be dismissible. */}
            <Pressable
              onPress={onDismiss}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Hide for now"
            >
              <X size={18} color={t.color.contentMuted} />
            </Pressable>
          </View>

          {summary.score != null ? (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="caption" tone="muted">
                  Confidence
                </Txt>
                <Txt variant="caption" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {Math.round(summary.score * 100)}%{' '}
                  <Txt variant="caption" tone="muted">
                    of {Math.round(summary.threshold * 100)}% needed
                  </Txt>
                </Txt>
              </View>
              <ProgressBar progress={Math.min(1, summary.score / (summary.threshold || 1))} />
            </View>
          ) : null}

          {shown.length > 0 ? (
            <View
              style={{
                gap: t.spacing.xs,
                borderTopWidth: 1,
                borderTopColor: t.color.hairline,
                paddingTop: t.spacing.md,
              }}
            >
              {shown.map((item) => (
                <View
                  key={item.key}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}
                >
                  {item.met ? (
                    <Check size={14} color={t.color.ok} />
                  ) : (
                    <X size={14} color={t.color.danger} />
                  )}
                  <Txt variant="caption" tone={item.met ? 'muted' : undefined} style={{ flex: 1 }}>
                    {item.label}
                    {item.weight === 0 && !item.met ? (
                      <Txt variant="caption" tone="warn"> — required</Txt>
                    ) : null}
                  </Txt>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {summary.ownership_verified ? (
              <>
                <BadgeCheck size={14} color={t.color.ok} />
                <Txt variant="caption" tone="muted" style={{ flex: 1 }}>
                  Instagram ownership confirmed
                </Txt>
              </>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Txt variant="caption" style={{ color: t.color.brand, fontWeight: '600' }}>
              View details
            </Txt>
            <ChevronRight size={14} color={t.color.brand} />
          </View>
        </Card>
      )}
    </Pressable>
  );
}
