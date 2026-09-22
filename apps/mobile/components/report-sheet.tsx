/**
 * Report or block someone, from wherever you meet them.
 *
 * App Store 1.2 and Google's UGC policy want reporting reachable where the
 * content is, not only inside a project. This sheet is used on creator and
 * business profiles, campaign pages, collaboration requests and the chat ⋮
 * menu; the project screen keeps its own older copy of the same UI (same words,
 * same API). The web twin is apps/web/src/components/safety/report-dialog.tsx.
 *
 * The report is ABOUT a person (`reportedId`). `context` says where it was made
 * so a moderator knows what to look at (migration 163); the server checks the
 * campaign / request id really belongs to that person.
 *
 * Like every Sheet here it must be a SIBLING of the scroll view, never a child
 * (see the note in apps/mobile/app/settings.tsx); the caller owns the ref.
 */
import { useState, type RefObject } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, CircleCheck, Flag } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { Button, Field, Txt } from '@/components/ui';
import { Sheet, type SheetRef } from '@/components/ui/sheet';

export type ReportContext =
  | { kind: 'profile' }
  | { kind: 'campaign'; campaignId: string }
  | { kind: 'request'; requestId: string };

const REASONS = [
  { value: 'scam', label: 'Scam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'spam', label: 'Spam' },
  { value: 'fake', label: 'Fake profile' },
  { value: 'other', label: 'Other' },
] as const;

/** A quiet "Report or block <name>" row to put at the end of a screen's content. */
export function ReportLink({ name, onPress }: { name: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Report or block ${name}`}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: t.spacing.md,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Flag size={14} color={t.color.contentMuted} />
      <Txt variant="footnote" tone="muted">
        Report or block {name}
      </Txt>
    </Pressable>
  );
}

export function ReportSheet({
  sheetRef,
  reportedId,
  reportedName,
  context,
}: {
  sheetRef: RefObject<SheetRef | null>;
  reportedId: string;
  reportedName: string;
  context: ReportContext;
}) {
  const t = useTheme();
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('scam');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function close() {
    sheetRef.current?.close();
    setDone(false);
    setError(null);
    setDetails('');
    setAlsoBlock(false);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await endpoints.createReport({
      reported_id: reportedId,
      reason,
      details: details.trim() || undefined,
      context: context.kind,
      ...(context.kind === 'campaign' ? { campaign_id: context.campaignId } : {}),
      ...(context.kind === 'request' ? { collab_request_id: context.requestId } : {}),
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error ?? 'Could not submit the report.');
      return;
    }
    if (alsoBlock) {
      const blockRes = await endpoints.createBlock({ blocked_id: reportedId });
      if (!blockRes.ok) {
        // The report already went through — don't lose that over the block
        // failing separately (e.g. a rate limit); say so instead.
        setBusy(false);
        setDone(true);
        setError('Report sent, but blocking failed — try again from Settings > Blocked accounts.');
        return;
      }
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setBusy(false);
    setDone(true);
  }

  return (
    <Sheet ref={sheetRef} title={`Report ${reportedName}`} onClose={close}>
      {done ? (
        <View style={{ alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.md }}>
          <CircleCheck size={32} color={t.color.ok} />
          <Txt variant="footnote" style={{ fontWeight: '700', textAlign: 'center' }}>
            Thanks — our team will review this report.
          </Txt>
          {error ? (
            <Txt variant="caption" tone="warn" style={{ textAlign: 'center' }}>
              {error}
            </Txt>
          ) : null}
          <Button label="Close" variant="secondary" size="md" onPress={close} />
        </View>
      ) : (
        <>
          <Txt variant="footnote" tone="muted">
            Reports are private and sent to the Influnet team for review.
          </Txt>

          <View style={{ gap: t.spacing.xs }}>
            <Txt variant="footnote" tone="soft">
              Reason
            </Txt>
            {REASONS.map((r) => {
              const selected = reason === r.value;
              return (
                <Pressable
                  key={r.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setReason(r.value)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: t.spacing.sm,
                    paddingHorizontal: t.spacing.md,
                    borderRadius: t.radii.md,
                    borderWidth: 1,
                    borderColor: selected ? t.color.brand : t.color.hairline,
                    backgroundColor: selected ? t.color.brandSoft : t.color.surfaceCard,
                  }}
                >
                  <Txt variant="footnote" style={{ fontWeight: selected ? '700' : '400' }}>
                    {r.label}
                  </Txt>
                  {selected ? <CircleCheck size={16} color={t.color.brand} /> : null}
                </Pressable>
              );
            })}
          </View>

          <Field label="Details (optional)" placeholder="What happened?" value={details} onChangeText={setDetails} multiline />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: alsoBlock }}
            onPress={() => setAlsoBlock((v) => !v)}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: t.spacing.sm,
              padding: t.spacing.md,
              borderRadius: t.radii.md,
              borderWidth: 1,
              borderColor: t.color.hairline,
              backgroundColor: t.color.surfaceMuted,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                borderWidth: 1.5,
                borderColor: alsoBlock ? t.color.danger : t.color.hairlineStrong,
                backgroundColor: alsoBlock ? t.color.danger : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 1,
              }}
            >
              {alsoBlock ? <Check size={13} color={t.color.white} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="footnote" style={{ fontWeight: '700' }}>
                Also block {reportedName}
              </Txt>
              <Txt variant="caption" tone="muted">
                They won&rsquo;t be able to message you or send new requests. Manage this later in Settings.
              </Txt>
            </View>
          </Pressable>

          {error ? (
            <Txt variant="footnote" tone="danger">
              {error}
            </Txt>
          ) : null}

          <Button
            label="Submit report"
            variant="danger"
            disabled={busy}
            loading={busy}
            icon={<Flag size={16} color={t.color.white} />}
            onPress={submit}
          />
        </>
      )}
    </Sheet>
  );
}
