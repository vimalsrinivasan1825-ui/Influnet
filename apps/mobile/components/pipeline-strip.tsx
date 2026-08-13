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
 * It scrolls horizontally rather than squeezing six columns into 375pt. Six
 * legible steps you can push with a thumb beat six unreadable ones that fit.
 */
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';

export interface PipelineStep {
  key: string;
  label: string;
  count: number;
}

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
      contentContainerStyle={{ alignItems: 'center', gap: 2, paddingRight: t.spacing.sm }}
    >
      {steps.map((step, i) => {
        // An empty step is drawn, not hidden: "nothing in review" is a fact
        // about the funnel, and a strip that changes shape as work moves
        // through it is unreadable at a glance.
        const active = step.count > 0;

        return (
          <View key={step.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              accessibilityRole={onPressStep ? 'button' : 'text'}
              accessibilityLabel={`${step.label}: ${step.count}`}
              onPress={onPressStep ? () => onPressStep(step.key) : undefined}
              style={({ pressed }) => ({
                minWidth: 78,
                paddingVertical: t.spacing.sm,
                paddingHorizontal: t.spacing.md,
                borderRadius: t.radii.md,
                backgroundColor: active ? t.color.brandSoft : t.color.surfaceMuted,
                borderWidth: 1,
                borderColor: active ? t.color.brand + '33' : t.color.hairline,
                alignItems: 'center',
                gap: 2,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Txt
                variant="title3"
                style={{
                  fontVariant: ['tabular-nums'],
                  color: active ? t.color.brand : t.color.contentMuted,
                }}
              >
                {step.count}
              </Txt>
              <Txt variant="caption" tone={active ? 'soft' : 'muted'} numberOfLines={1}>
                {step.label}
              </Txt>
            </Pressable>

            {i < steps.length - 1 ? (
              <ChevronRight size={13} color={t.color.contentMuted} style={{ marginHorizontal: 1 }} />
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
