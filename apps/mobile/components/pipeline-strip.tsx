/**
 * The whole funnel on one line: request in → work → money → done.
 *
 * Home used to show this as four vertical bars ("Where your work is sitting"),
 * which cost a whole card of height to say something a strip says in a third of
 * it — and started at the wrong place. A brand asking is the FIRST step of a
 * collaboration, and no stage-based view can show it, because nothing has been
 * created yet. The six steps come from the API (see PIPELINE_STEPS in
 * /api/home) so web and mobile can never draw different funnels.
 *
 * ── ONE ICON AND ONE COLOR PER STEP, KEYED OFF `step.key` ──────────────
 *
 * Home used to inline its own strip and tint the steps by ARRAY POSITION
 * (`stepColors[idx % stepColors.length]`). Two things were wrong with that.
 * Position is not identity: the day the API stops sending a step because a
 * role doesn't have it, every colour after it shifts one place and "purple"
 * silently starts meaning Review instead of Production. And it disagreed with
 * web, which keys the same six steps off `step.key` — so the same funnel was
 * pink-then-amber on a phone and blue-then-indigo in a browser.
 *
 * The table below is the same six colors as PIPELINE_STEP_STYLE in
 * apps/web/src/app/dashboard/home/page.tsx. Keep them in step.
 *
 * It scrolls horizontally rather than squeezing six columns into 375pt. Six
 * legible steps you can push with a thumb beat six unreadable ones that fit.
 */
import type { ComponentType } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  BadgeCheck,
  Camera,
  ChevronRight,
  CreditCard,
  Eye,
  Handshake,
  Inbox,
} from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';

export interface PipelineStep {
  key: string;
  label: string;
  count: number;
}

interface StepStyle {
  icon: ComponentType<{ size?: number; color?: string }>;
  color: string;
}

const STEP_STYLE: Record<string, StepStyle> = {
  requests: { icon: Inbox, color: '#0BA5EC' },
  setup: { icon: Handshake, color: '#6172F3' },
  production: { icon: Camera, color: '#9E77ED' },
  review: { icon: Eye, color: '#F79009' },
  payment: { icon: CreditCard, color: '#12B76A' },
  completed: { icon: BadgeCheck, color: '#16A34A' },
};

export function PipelineStrip({
  steps,
  onPressStep,
}: {
  steps: PipelineStep[];
  onPressStep?: (key: string) => void;
}) {
  const t = useTheme();
  if (steps.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ alignItems: 'center', paddingRight: t.spacing.sm }}
    >
      {steps.map((step, i) => {
        // An empty step is drawn, not hidden: "nothing in review" is a fact
        // about the funnel, and a strip that changes shape as work moves
        // through it is unreadable at a glance. An inactive step keeps its
        // ICON and loses its COLOR, so the row still reads as six named places.
        const style = STEP_STYLE[step.key] ?? STEP_STYLE.requests;
        const Icon = style.icon;
        const active = step.count > 0;

        return (
          <View key={step.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              accessibilityRole={onPressStep ? 'button' : 'text'}
              accessibilityLabel={`${step.label}: ${step.count}`}
              onPress={onPressStep ? () => onPressStep(step.key) : undefined}
              style={({ pressed }) => ({
                minWidth: 84,
                paddingVertical: t.spacing.md,
                paddingHorizontal: t.spacing.md,
                borderRadius: t.radii.md,
                backgroundColor: active ? `${style.color}14` : t.color.surfaceMuted,
                borderWidth: 1,
                borderColor: active ? `${style.color}40` : t.color.hairline,
                alignItems: 'center',
                gap: 4,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: t.radii.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? style.color : t.color.hairline,
                }}
              >
                <Icon size={15} color={active ? t.color.white : t.color.contentMuted} />
              </View>

              <Txt
                variant="title3"
                style={{
                  fontVariant: ['tabular-nums'],
                  color: active ? style.color : t.color.contentMuted,
                }}
              >
                {step.count}
              </Txt>
              <Txt variant="caption" tone={active ? 'soft' : 'muted'} numberOfLines={1}>
                {step.label}
              </Txt>
            </Pressable>

            {i < steps.length - 1 ? (
              <ChevronRight size={13} color={t.color.contentMuted} style={{ marginHorizontal: 2 }} />
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
