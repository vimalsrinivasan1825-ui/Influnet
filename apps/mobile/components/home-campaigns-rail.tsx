/**
 * "Discover campaigns" — the horizontal rail of open campaigns on Home.
 *
 * ── WHAT IS AND IS NOT ON THESE CARDS ─────────────────────────────────
 *
 * The design this came from put a "97% match" badge on every card. There is no
 * match score in this product — no scoring function, no column, nothing that
 * could produce one — so the badge would have been a number invented at render
 * time and dressed up as a recommendation. That is the same failure as a stat
 * tile showing a bold 0 it cannot support, except worse: a fabricated match
 * score changes which campaign someone applies to. It is left out until
 * something real can fill it.
 *
 * What IS on the card is all real and all from /api/campaigns: the title, the
 * brand's name, the platforms, the budget range, and how long is left to apply.
 * The last of those is the one that changes behaviour — "3 days left" is the
 * difference between browsing and applying — so it gets the badge position the
 * match score would have had.
 *
 * ── THE IMAGE ─────────────────────────────────────────────────────────
 *
 * The campaigns table has no image column, so every card here is generated
 * cover art seeded off the campaign id (see ui/cover-art.tsx). Should an image
 * column ever land, `imageUrl` below is the only thing that needs filling in.
 *
 * ── AND WHY IT CAN VANISH ENTIRELY ────────────────────────────────────
 *
 * Renders nothing at all when there are no live campaigns. A "Discover
 * campaigns" heading over an empty rail, or over a single "nothing here yet"
 * tile, is a section whose only content is an apology — and Home already has a
 * campaigns CTA further down that works whether or not the board has anything
 * on it today. One empty section removed beats one empty state designed.
 */
import { Image, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Clock } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { formatCount } from '@/lib/format';
import { PlatformMark } from '@/components/platform-mark';
import { CoverArt, PressableScale, SectionLabel, Txt } from '@/components/ui';

export interface RailCampaign {
  id: string;
  title: string;
  platforms?: string[] | null;
  budget_min?: number | null;
  budget_max?: number | null;
  expires_at?: string | null;
  /** Present on a brand's own list, absent on the public board (all live). */
  status?: string | null;
  business_user?: { id: string; name: string | null } | null;
  /** Not in the schema yet. Wired through so the day it exists this just works. */
  imageUrl?: string | null;
}

const CARD_WIDTH = 190;
const COVER_HEIGHT = 108;

/** Whole days left to apply. Null when there is no deadline or it has passed. */
function daysLeft(expiresAt?: string | null): number | null {
  if (!expiresAt) return null;
  const d = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  return d > 0 ? d : null;
}

/**
 * The money line.
 *
 * A range collapses to a single figure when both ends match, and to "₹45K+"
 * when only the floor is known. Never "₹0" and never "Budget: —": a campaign
 * with no stated budget simply does not get the line, because an empty money
 * field on a paid-work listing reads as "unpaid" rather than as "unspecified".
 */
function budgetLabel(min?: number | null, max?: number | null): string | null {
  const lo = min && min > 0 ? min : null;
  const hi = max && max > 0 ? max : null;
  if (lo && hi) return lo === hi ? `₹${formatCount(lo)}` : `₹${formatCount(lo)} – ₹${formatCount(hi)}`;
  if (lo) return `₹${formatCount(lo)}+`;
  if (hi) return `up to ₹${formatCount(hi)}`;
  return null;
}

export function HomeCampaignsRail({
  campaigns,
  isCreator,
}: {
  campaigns: RailCampaign[];
  /**
   * Decides the heading, because the rail holds different things for the two
   * sides: a creator sees the open board (work to discover), a brand sees its
   * own live listings (work it is running). "Discover campaigns" over a brand's
   * own campaigns is a label that describes neither the content nor the tap.
   */
  isCreator: boolean;
}) {
  const t = useTheme();
  const router = useRouter();

  // The whole section, not just the rail. See the note above.
  if (campaigns.length === 0) return null;

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: t.spacing.md,
        }}
      >
        <SectionLabel>{isCreator ? 'Discover campaigns' : 'Your live campaigns'}</SectionLabel>
        <PressableScale
          onPress={() => router.push('/campaigns' as never)}
          accessibilityRole="button"
          accessibilityLabel="View all campaigns"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Txt variant="caption" style={{ color: t.color.brand, fontWeight: '700' }}>
              View all
            </Txt>
            <ChevronRight size={14} color={t.color.brand} />
          </View>
        </PressableScale>
      </View>

      {/* Full-bleed: the rail runs to both screen edges so the last card is
          visibly cut off, which is what tells someone it scrolls. A rail inset
          to the page gutter looks like a finished row of three. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -t.spacing.screen }}
        contentContainerStyle={{
          paddingHorizontal: t.spacing.screen,
          gap: t.spacing.md,
          paddingVertical: 2,
        }}
      >
        {campaigns.map((c) => {
          const days = daysLeft(c.expires_at);
          const budget = budgetLabel(c.budget_min, c.budget_max);
          const platform = c.platforms?.[0] ?? null;

          return (
            <PressableScale
              key={c.id}
              onPress={() => router.push(`/campaigns/${c.id}` as never)}
              accessibilityRole="button"
              accessibilityLabel={`${c.title}${budget ? `, ${budget}` : ''}`}
              style={{ width: CARD_WIDTH }}
            >
              {/* Two layers, same reason as Card in ui/surfaces.tsx: the cover
                  art needs `overflow: 'hidden'` to sit inside the rounded
                  corners, and on iOS that clips the card's own shadow away. */}
              <View
                style={[
                  {
                    width: CARD_WIDTH,
                    borderRadius: t.radii.lg,
                    backgroundColor: t.color.surfaceCard,
                  },
                  t.shadows.card,
                ]}
              >
              <View
                style={{
                  width: CARD_WIDTH,
                  backgroundColor: t.color.surfaceCard,
                  borderRadius: t.radii.lg,
                  borderWidth: 1,
                  borderColor: 'transparent',
                  overflow: 'hidden',
                }}
              >
                <View>
                  {c.imageUrl ? (
                    <Image
                      source={{ uri: c.imageUrl }}
                      style={{ width: CARD_WIDTH, height: COVER_HEIGHT }}
                      resizeMode="cover"
                    />
                  ) : (
                    <CoverArt seed={c.id} width={CARD_WIDTH} height={COVER_HEIGHT}>
                      {platform ? (
                        <PlatformMark platform={platform} size={30} />
                      ) : null}
                    </CoverArt>
                  )}

                  {/* Urgency, in the corner the match badge would have taken.
                      Shown only inside a fortnight — "27 days left" is not
                      urgency, it is a date, and a permanent badge on every card
                      stops meaning anything. */}
                  {days != null && days <= 14 ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: t.spacing.sm,
                        left: t.spacing.sm,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: t.radii.pill,
                        backgroundColor: 'rgba(15,23,42,0.72)',
                      }}
                    >
                      <Clock size={11} color={t.color.white} />
                      <Txt
                        variant="caption"
                        style={{ color: t.color.white, fontWeight: '700', fontSize: 11 }}
                      >
                        {days === 1 ? '1 day left' : `${days} days left`}
                      </Txt>
                    </View>
                  ) : null}
                </View>

                <View style={{ padding: t.spacing.md, gap: 3 }}>
                  <Txt variant="bodyStrong" numberOfLines={2} style={{ fontSize: 15, lineHeight: 20 }}>
                    {c.title}
                  </Txt>
                  {/* Only for a creator. A brand does not need its own name
                      printed on every one of its own campaign cards. */}
                  {isCreator && c.business_user?.name ? (
                    <Txt variant="caption" tone="muted" numberOfLines={1}>
                      {c.business_user.name}
                    </Txt>
                  ) : null}
                  {/* Only when there is one — see budgetLabel. */}
                  {budget ? (
                    <Txt
                      variant="caption"
                      numberOfLines={1}
                      style={{ color: t.color.brand, fontWeight: '700', marginTop: 2 }}
                    >
                      {budget}
                    </Txt>
                  ) : null}
                </View>
              </View>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}
