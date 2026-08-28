/**
 * The first-run state: what Home shows an account that has no data yet.
 *
 * ── THE PROBLEM THIS SOLVES ───────────────────────────────────────────
 *
 * A brand-new account reaches Home with nothing: no projects, no requests, no
 * views, no money. Rendered literally, that is a headline saying "you're all
 * caught up", an empty pipeline, and a grid of six bold zeros. Every one of
 * those statements is true and the screen as a whole is a lie — it tells
 * someone on day one that they have arrived at the end of something, when they
 * have arrived at the beginning.
 *
 * Worse, it is unactionable. Nothing on that screen says what makes the numbers
 * move, so the honest reading is "this product does not work yet" and the
 * honest response is to close it.
 *
 * ── WHAT REPLACES IT, AND THE REASONING ───────────────────────────────
 *
 * One card that converts absence into progress. Four things are deliberate:
 *
 *  1. **The list starts already partly done.** "Account created" is ticked
 *     before they do anything. This is endowed progress: a task list shown at
 *     1-of-4 gets finished far more often than the identical list shown at
 *     0-of-3, because people finish things they have started and start
 *     nothing. It costs one row and it is the highest-leverage line in here.
 *
 *  2. **A ring, not a percentage.** What motivates is watching the remaining
 *     distance shrink. A ring shows the gap; "25%" shows a score, and a score
 *     invites judgement rather than motion.
 *
 *  3. **Exactly one call to action — the next incomplete step.** Four buttons
 *     of equal weight is a decision, and a decision on an empty screen is where
 *     people leave. Later steps stay visible (so the path is legible and the
 *     end is in sight) but dimmed, and only the next one is pressable.
 *
 *  4. **Steps are named by their payoff, not their mechanics.** "Verify your
 *     Instagram" is a chore. "Brands filter for the badge before they ever
 *     message" is a reason. The subtitle on every row is the reason.
 *
 * The card disappears the moment the list is complete. A setup card lingering
 * at 4-of-4 turns the top of Home into a trophy nobody asked for.
 */
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Check, FolderKanban } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Button, Card, DashedRule, ProgressRing, Txt } from '@/components/ui';
import { PressableScale } from '@/components/ui/motion';

export interface SetupStep {
  key: string;
  /** The action, in the imperative. Short enough to be a button label. */
  label: string;
  /** What it gets them. Never a restatement of the label. */
  payoff: string;
  done: boolean;
  href: string;
}

/**
 * Build the checklist from what Home already knows.
 *
 * Every step is derived from a field the endpoint already returns — nothing
 * here triggers a second fetch, because this card renders at the slowest
 * moment in the product's life: first launch, cold cache, unknown network.
 *
 * A field we cannot read counts the step as NOT done. That is the right way
 * round: prompting someone to do something they have already done costs one
 * confused tap, while wrongly marking it complete strands them on a checklist
 * that will never finish.
 */
export function buildSetupSteps({
  isCreator,
  hasBio,
  hasNiche,
  hasSocial,
  verified,
  approved,
  hasActivity,
}: {
  isCreator: boolean;
  hasBio: boolean;
  hasNiche: boolean;
  hasSocial: boolean;
  verified: boolean;
  approved: boolean;
  /** Any request or project, ever — the step that means "you're actually using it". */
  hasActivity: boolean;
}): SetupStep[] {
  // Ticked from the start, on purpose. See note 1 above.
  const created: SetupStep = {
    key: 'account',
    label: 'Account created',
    payoff: "You're on Influnet — that part's done.",
    done: true,
    href: '/profile',
  };

  if (isCreator) {
    return [
      created,
      {
        key: 'profile',
        label: 'Finish your profile',
        payoff: 'A bio and a niche are what brands search on.',
        done: hasBio && hasNiche,
        href: '/edit-profile',
      },
      {
        key: 'social',
        label: 'Connect a channel',
        payoff: 'Your real reach, pulled in automatically.',
        done: hasSocial,
        href: '/edit-profile',
      },
      {
        key: 'verify',
        label: 'Get verified',
        payoff: 'Brands filter for the badge before they ever message.',
        done: verified,
        href: '/verification',
      },
      {
        key: 'first',
        label: 'Land your first collab',
        payoff: 'Browse open campaigns and apply to one that fits.',
        done: hasActivity,
        href: '/campaigns',
      },
    ];
  }

  return [
    created,
    {
      key: 'profile',
      label: 'Finish your business profile',
      payoff: 'Creators check who is asking before they reply.',
      done: hasBio,
      href: '/edit-profile',
    },
    {
      key: 'approved',
      label: 'Get approved',
      payoff: 'Approval is what unlocks messaging creators directly.',
      done: approved,
      href: '/profile',
    },
    {
      key: 'first',
      label: 'Post your first campaign',
      payoff: 'Let the right creators come to you.',
      done: hasActivity,
      href: '/campaigns/new',
    },
  ];
}

export function HomeSetupCard({ steps, name }: { steps: SetupStep[]; name?: string | null }) {
  const t = useTheme();
  const router = useRouter();

  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const remaining = steps.length - doneCount;
  const firstName = (name ?? '').trim().split(/\s+/)[0] || null;

  // Complete: the card has done its job and gets out of the way.
  if (!next) return null;

  return (
    <Card raised style={{ gap: t.spacing.lg, borderColor: t.color.brandRing }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg }}>
        {/* The line beside it already says how many steps are left, so the
            ring only has to carry the count. */}
        <ProgressRing
          progress={doneCount / steps.length}
          size={58}
          label={`${doneCount}/${steps.length}`}
        />
        <View style={{ flex: 1, gap: 3 }}>
          {/* Named, when we have one. "Welcome, Priya" and "Get set up" are
              the same card doing the same job, but only one of them sounds
              like it was written for the person reading it. */}
          <Txt variant="title3">{firstName ? `Welcome, ${firstName}` : 'Get set up'}</Txt>
          <Txt variant="footnote" tone="soft">
            {/* Names the remaining distance, not the score. "Two steps left" is
                a small ask; "50% complete" is a grade. */}
            {remaining === 1
              ? 'One step left before brands can find you.'
              : `${remaining} short steps and you're live.`}
          </Txt>
        </View>
      </View>

      <View style={{ gap: t.spacing.md }}>
        {steps.map((step) => {
          const isNext = step.key === next.key;
          return (
            <View
              key={step.key}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: t.spacing.md,
                // Later steps are dimmed rather than hidden. Hiding them removes
                // the one thing that makes a list feel finishable: seeing where
                // it ends.
                opacity: step.done || isNext ? 1 : 0.45,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                  backgroundColor: step.done ? t.color.brand : 'transparent',
                  borderWidth: step.done ? 0 : 2,
                  borderColor: isNext ? t.color.brand : t.color.hairlineStrong,
                }}
              >
                {step.done ? <Check size={13} color={t.color.white} strokeWidth={3} /> : null}
              </View>

              <View style={{ flex: 1, gap: 1 }}>
                <Txt
                  variant="bodyStrong"
                  style={
                    step.done
                      ? { color: t.color.contentMuted, textDecorationLine: 'line-through' }
                      : undefined
                  }
                >
                  {step.label}
                </Txt>
                {/* The payoff is dropped once a step is done — a reason to do
                    something you have already done is noise. */}
                {step.done ? null : (
                  <Txt variant="footnote" tone="muted">
                    {step.payoff}
                  </Txt>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* The one action. Labelled with the step itself, so the button and the
          row it points at say the same words. */}
      <Button
        label={next.label}
        onPress={() => router.push(next.href as never)}
        icon={<ArrowRight size={17} color={t.color.white} />}
        iconPosition="right"
      />
    </Card>
  );
}

/**
 * The empty "Project pipeline" section.
 *
 * Not an `EmptyState` with a shrug icon, and not a bare "No projects". An empty
 * pipeline on a marketplace is not a failure — it is a state with exactly one
 * obvious next move, so the card shows the shape of the thing that is missing,
 * names it, and gives one button that starts it.
 *
 * The three-node connector is the point. A first-time user has no mental model
 * of what a "project" is here, and an empty box teaches them nothing. A faint
 * diagram of stages linked in sequence tells them, before they have any data at
 * all, that this is a thing that MOVES — which is the fact that makes starting
 * one feel worth the effort.
 *
 * Drawn from Views and icons rather than shipped as an illustration asset: it
 * re-tints with the role accent for free, costs nothing in the bundle, and
 * stays sharp at any density.
 */
export function HomeEmptyPipeline({ isCreator }: { isCreator: boolean }) {
  const t = useTheme();
  const router = useRouter();

  return (
    <Card style={{ alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing['2xl'] }}>
      {/* Middle node larger and fully opaque — a flat row of three identical
          circles reads as a loading spinner rather than as a diagram. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: t.spacing.xs,
        }}
      >
        <PipelineNode size={38} opacity={0.35} />
        <PipelineConnector />
        <PipelineNode size={50} opacity={1} />
        <PipelineConnector />
        <PipelineNode size={38} opacity={0.35} />
      </View>

      <Txt variant="title3" center>
        No projects yet
      </Txt>
      <Txt variant="footnote" tone="muted" center style={{ maxWidth: 280 }}>
        {isCreator
          ? 'Apply to an open campaign and it lands here — every stage from brief to payment in one place.'
          : 'Start a collaboration and track it here — every stage from brief to payment in one place.'}
      </Txt>

      <Button
        label={isCreator ? 'Find your first campaign' : 'Start your first project'}
        onPress={() => router.push((isCreator ? '/campaigns' : '/search') as never)}
        icon={<ArrowRight size={17} color={t.color.white} />}
        iconPosition="right"
        inline
        size="md"
        style={{ marginTop: t.spacing.sm }}
      />
    </Card>
  );
}

function PipelineNode({ size, opacity }: { size: number; opacity: number }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.color.brandSoft,
        borderWidth: 1,
        borderColor: t.color.brandRing,
        opacity,
      }}
    >
      <FolderKanban size={Math.round(size * 0.44)} color={t.color.brand} />
    </View>
  );
}

/**
 * The link between two nodes. Dashed, because nothing has happened yet.
 *
 * Via DashedRule rather than `borderStyle: 'dashed'`, which Android renders as
 * a solid line when only one side has a width — see the note there.
 */
function PipelineConnector() {
  const t = useTheme();
  return (
    <View style={{ width: 26 }}>
      <DashedRule color={t.color.brandRing} />
    </View>
  );
}

/**
 * The "browse campaigns" nudge in its empty-state form.
 *
 * Distinct from the ordinary Campaigns row further down Home: that one is a
 * list row someone taps when they already know what they are looking for. This
 * one has to explain what an open campaign IS to a person who has never seen
 * one, so it spends a whole card on doing that.
 */
export function HomeBrowseCampaigns({ isCreator }: { isCreator: boolean }) {
  const t = useTheme();
  const router = useRouter();

  return (
    <PressableScale
      // Cast: `/campaigns` is not in expo-router's generated route union
      // because app/campaigns.tsx and app/campaigns/ both exist. Same cast the
      // Home screen has always used for this destination.
      onPress={() => router.push((isCreator ? '/campaigns' : '/search') as never)}
      accessibilityRole="button"
      accessibilityLabel={isCreator ? 'Browse open campaigns' : 'Find creators'}
    >
      <Card
        style={{
          gap: t.spacing.sm,
          backgroundColor: t.color.brandSoft,
          borderColor: t.color.brandRing,
        }}
      >
        <Txt variant="bodyStrong">
          {isCreator ? 'No projects yet — that starts here' : 'No campaigns running yet'}
        </Txt>
        <Txt variant="footnote" tone="soft">
          {isCreator
            ? 'Brands post open campaigns every week. Applying to one is the fastest route to a first project.'
            : 'Post a campaign and let creators apply, or search for someone specific.'}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <Txt variant="footnote" style={{ color: t.color.brand, fontWeight: '700' }}>
            {isCreator ? 'Browse open campaigns' : 'Find creators'}
          </Txt>
          <ArrowRight size={14} color={t.color.brand} />
        </View>
      </Card>
    </PressableScale>
  );
}
