/**
 * "Your turn to sign off" — the design's pink card inside a conversation.
 *
 * Most stage sign-offs are agreed in chat ("looks good, signing now"), and the
 * person then had to leave the thread, open the project, find the stage and
 * slide there. When the conversation's live project is sitting on a mutual
 * sign-off stage that is waiting on YOU, this card offers the slider right
 * above the composer.
 *
 * It only appears when that is really the case — the same verdict Home and
 * the project screen reach (projectTurn in @influnet/core), never on a
 * payment stage (those open only from the signed Razorpay webhook), and never
 * once you have signed. The server still owns every gate: an open checklist
 * item comes back as its 409 and is shown here, with a link into the project.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { flowOf, isMutualSignoffStage, otherParticipant, projectTurn, stageSignoffAt } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { useLiveRefresh } from '@/lib/realtime';
import { humanizeStage, timeAgo } from '@/lib/format';
import { SlideToConfirm, Txt } from '@/components/ui';

const PAYMENT_STAGES = new Set(['advance_payment', 'final_payment', 'quick_payment']);

interface ChatProject {
  id: string;
  status: string;
  current_stage: string;
  flow_key?: string | null;
  owner_user_id: string | null;
  counterparty_user_id: string | null;
  stage_progress: Record<string, unknown> | null;
  owner?: { name?: string } | null;
  counterparty?: { name?: string } | null;
}

export function ChatSignoffCard({
  projectId,
  me,
  onSigned,
}: {
  projectId: string;
  me: string | null | undefined;
  /** Called after a successful sign-off, so the deal bar can re-read. */
  onSigned?: () => void;
}) {
  const t = useTheme();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shares the project screen's cache key, so opening the project from here
  // paints from what this card already fetched.
  const { data, revalidate } = useFetch(
    () => endpoints.getProject<{ project: ChatProject }>(projectId),
    { cacheKey: `project:${projectId}` },
  );
  // The other side signing (or the stage moving on) repaints the card live.
  useLiveRefresh('projects', revalidate);

  const project = data?.project;
  if (!project || !me || project.status !== 'active') return null;

  const flow = flowOf(project);
  const stage = project.current_stage;
  const isOwner = project.owner_user_id === me;
  const side = isOwner ? 'business' : 'creator';
  if (!isMutualSignoffStage(stage, flow) || PAYMENT_STAGES.has(stage)) return null;
  if (stageSignoffAt(project.stage_progress, stage, side)) return null;
  const { turn } = projectTurn({ stage, side, stageProgress: project.stage_progress, flow });
  if (turn !== 'you') return null;

  const theirsAt = stageSignoffAt(project.stage_progress, stage, isOwner ? 'creator' : 'business');
  const partner = otherParticipant(
    isOwner,
    project.owner_user_id,
    project.counterparty_user_id,
    project.owner,
    project.counterparty,
  ).name;
  const first = partner.split(/\s+/)[0] || partner;
  const stageName = humanizeStage(stage);

  return (
    <View style={{ paddingHorizontal: t.spacing.screen, paddingTop: t.spacing.sm }}>
      <View
        style={{
          backgroundColor: t.color.brand,
          borderRadius: 26,
          padding: 16,
          gap: 10,
          shadowColor: t.color.brand,
          shadowOpacity: 0.22,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
        }}
      >
        <View style={{ gap: 2 }}>
          <Txt style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700' }}>
            {theirsAt ? `${first} signed off ${stageName} ${timeAgo(theirsAt)}` : stageName}
          </Txt>
          <Txt style={{ color: '#fff', fontSize: 19, fontWeight: '800', letterSpacing: -0.5 }}>Your turn to sign off</Txt>
        </View>
        <SlideToConfirm
          tone="onBrand"
          label="Slide to sign off"
          busy={busy}
          onConfirm={async () => {
            setBusy(true);
            setError(null);
            const res = await endpoints.updateProject(projectId, { action: 'signoff', stage });
            setBusy(false);
            if (!res.ok) {
              setError(res.error ?? 'Could not sign off.');
              return;
            }
            revalidate();
            onSigned?.();
          }}
        />
        {error ? (
          <View style={{ backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 14, padding: 10 }}>
            <Txt style={{ color: '#fff', fontSize: 13, lineHeight: 18 }}>{error}</Txt>
          </View>
        ) : null}
        <Pressable
          onPress={() => router.push(`/projects/${projectId}/stage/${stage}` as never)}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel={`Open ${stageName}`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}
        >
          <Txt style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700' }}>See the stage checklist</Txt>
          <ArrowRight size={14} color="rgba(255,255,255,0.9)" />
        </Pressable>
      </View>
    </View>
  );
}
