/**
 * One project in a list.
 *
 * ── WHAT THE CARD ANSWERS, IN ORDER ───────────────────────────────────
 *
 * What is it (icon + title), who with (partner), how far (step + bar +
 * percentage), when is it due, and how much. That order is the order someone
 * scans, and it is why the percentage sits on the right of the step line
 * rather than under the bar: the eye lands on the title, tracks right along
 * the same line, and gets the answer before it reaches the bar at all. The bar
 * then confirms it rather than being the only place to find it.
 *
 * The icon does the work no text can: `campaign_projects` has no image, so
 * without it a list of projects is three lines of grey type repeated. See
 * lib/project-icon.ts — it is classified from what the project says it is,
 * not hashed.
 *
 * That classification reads the title AND the description, and this card has
 * to pass both. It used to pass only the title while the project's own screen
 * passed both, so a project whose subject sits in its description wore a slate
 * folder in the list and its real icon and colour one tap later — the two
 * screens disagreeing about the same project, which is exactly the recognition
 * the icon exists to provide.
 *
 * ── DUE DATES ARE A WARNING OR THEY ARE NOTHING ───────────────────────
 *
 * The footer shows the deadline in the accent normally, in `warn` once it is
 * inside three days or the move is yours, and not at all when the project has
 * no `due_date`. An "overdue" project whose deadline nobody set is a scolding
 * for something that never happened.
 */
import { View } from 'react-native';
import { CalendarDays, ChevronRight, TriangleAlert } from 'lucide-react-native';
import { flowOf } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { formatCurrency } from '@/lib/format';
import { lookForProject } from '@/lib/project-icon';
import { ProjectIcon } from '@/components/project-cover';
import { Badge, Card, PressableScale, ProgressBar, Txt } from '@/components/ui';

export interface ProjectCardData {
  id: string;
  title: string;
  /**
   * Classified alongside the title — see the note above. Optional only
   * because a project may genuinely have none, never because a caller may
   * skip passing it.
   */
  description?: string | null;
  status: string;
  current_stage: string;
  flow_key?: string | null;
  budget: number | null;
  due_date?: string | null;
  created_at?: string | null;
  partner: string;
  /** Resolved by the caller from styleForStatus. */
  statusLabel: string;
  statusFg: string;
  statusBg: string;
  /** True when this side is the one holding the project up. */
  yourMove?: boolean;
}

/** Whole days until the deadline. Negative once it has passed; null with none. */
function daysUntil(due?: string | null): number | null {
  if (!due) return null;
  const ms = new Date(due).getTime();
  if (Number.isNaN(ms)) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.round((new Date(ms).setHours(0, 0, 0, 0) - start.getTime()) / 86_400_000);
}

function dueLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

/** "Started 18 Aug" — short, and only carries a year once it is not this one. */
function startedLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `Started ${d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })}`;
}

export function ProjectCard({ data, onPress }: { data: ProjectCardData; onPress: () => void }) {
  const t = useTheme();

  const look = lookForProject(data.title, data.description);
  const flow = flowOf({ flow_key: data.flow_key });
  const index = flow.stages.indexOf(data.current_stage);
  // An unknown stage means this build and the database disagree about the
  // flow. Reporting it as step zero of twelve would be a claim; reporting no
  // progress at all is the truth.
  const known = index >= 0;
  const step = known ? index + 1 : null;
  const progress = known ? step! / flow.stages.length : 0;

  const days = daysUntil(data.due_date);
  const due = dueLabel(days);
  const urgent = data.yourMove || (days !== null && days <= 3);
  const started = startedLabel(data.created_at);

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${data.title} with ${data.partner}. ${data.statusLabel}.${
        step ? ` Step ${step} of ${flow.stages.length}.` : ''
      }${due ? ` ${due}.` : ''}`}
    >
      <Card>
        <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'flex-start' }}>
          <ProjectIcon look={look} size={56} />

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.sm }}>
              <Txt variant="title3" numberOfLines={2} style={{ flex: 1 }}>
                {data.title}
              </Txt>
              <Badge label={data.statusLabel} fg={data.statusFg} bg={data.statusBg} />
            </View>

            <Txt
              variant="footnote"
              numberOfLines={1}
              style={{ color: t.color.brand, fontWeight: '600', marginTop: 1 }}
            >
              {data.partner}
            </Txt>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.sm,
                marginTop: 6,
              }}
            >
              {step ? (
                <View
                  style={{
                    backgroundColor: t.color.surface,
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Txt variant="caption" tone="soft" style={{ fontWeight: '600' }}>
                    Step {step} of {flow.stages.length}
                  </Txt>
                </View>
              ) : null}
              {started ? (
                <Txt variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                  {started}
                </Txt>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              {known ? (
                <Txt
                  style={{
                    fontSize: 19,
                    lineHeight: 23,
                    fontWeight: '800',
                    letterSpacing: -0.4,
                    color: t.color.brand,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {Math.round(progress * 100)}%
                </Txt>
              ) : null}
            </View>
          </View>
        </View>

        {known ? <ProgressBar progress={progress} style={{ marginTop: t.spacing.md }} /> : null}

        {/* Only when there is something to say. A footer rule above an empty
            row is a divider separating nothing from nothing. */}
        {due || data.budget ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.sm,
              marginTop: t.spacing.md,
              paddingTop: t.spacing.md,
              borderTopWidth: 1,
              borderTopColor: t.color.hairline,
            }}
          >
            {due ? (
              <>
                {urgent ? (
                  <TriangleAlert size={15} color={t.color.warn} />
                ) : (
                  <CalendarDays size={15} color={t.color.brand} />
                )}
                <Txt
                  variant="footnote"
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontWeight: '600',
                    color: urgent ? t.color.warn : t.color.brand,
                  }}
                >
                  {due}
                  {data.yourMove ? ' · your move' : ''}
                </Txt>
              </>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            {data.budget ? (
              <Txt variant="bodyStrong" style={{ fontSize: 14 }}>
                {formatCurrency(data.budget)}
              </Txt>
            ) : null}
            <ChevronRight size={16} color={t.color.contentMuted} />
          </View>
        ) : null}
      </Card>
    </PressableScale>
  );
}
