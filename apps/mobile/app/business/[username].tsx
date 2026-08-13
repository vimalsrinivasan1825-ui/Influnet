/**
 * A business's profile, rendered natively — the business twin of
 * app/creator/[username].tsx.
 *
 * Business profiles are PRIVATE, unlike a creator's public one: only the
 * business itself and a creator with an established relationship (a collab
 * request or a campaign project) can see it. /api/businesses/[username]
 * enforces that in the database via get_business_eligibility — anyone else
 * gets a 404 here, exactly like the web page at /<username> does.
 *
 * This exists so "Preview public profile" on a business account's own Profile
 * tab, and a creator viewing a brand it has a live relationship with, stay
 * inside the app instead of handing off to expo-web-browser — the same fix
 * applied to the creator side (see the header note on profile.tsx's
 * "Preview public profile" row for why leaving the app reads as broken).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Briefcase,
  CalendarDays,
  Globe,
  Handshake,
  Lock,
  MapPin,
  ShieldCheck,
  Users,
} from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  ScreenScroll,
  SectionLabel,
  SkeletonCard,
  StickyFooter,
  Txt,
} from '@/components/ui';

interface BusinessProfileView {
  userId: string;
  name: string;
  companyName: string | null;
  location: string | null;
  industry: string | null;
  businessType: string | null;
  teamSize: string | null;
  website: string | null;
  mission: string | null;
  brandStory: string | null;
  products: string | null;
  services: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  approvalStatus: string | null;
  memberSince: string | null;
  completedCollaborations: number;
  totalPartners: number;
}

interface BusinessProfileResponse {
  data: BusinessProfileView;
  isOwner: boolean;
}

function monthYear(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export default function BusinessDetail() {
  const t = useTheme();
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();
  const myUserId = useSession((s) => s.session?.user.id);
  const [messaging, setMessaging] = useState(false);

  const { data: res, error, loading, refreshing, refresh } = useFetch(
    () => endpoints.getBusinessProfile<BusinessProfileResponse>(username),
    { cacheKey: `business:${username}` },
  );

  const biz = res?.data;
  const isOwner = res?.isOwner ?? biz?.userId === myUserId;

  /**
   * "Message this brand" opens a conversation directly rather than routing
   * through /requests/new. Reaching this screen at all already proved a
   * relationship exists — the eligibility RPC 404s otherwise — so this is
   * "continue the conversation," the same action web's sidebar button takes
   * it to (`/dashboard/messages?new=...`), not "ask to work together."
   */
  async function messageBrand() {
    if (!biz) return;
    setMessaging(true);
    const res = await endpoints.createConversation<{ conversation: { id: string } }>({
      other_user_id: biz.userId,
    });
    setMessaging(false);
    if (res.ok && res.data?.conversation?.id) {
      router.push({
        pathname: '/conversations/[id]',
        params: { id: res.data.conversation.id, name: biz.name },
      });
    }
  }

  const stats = biz
    ? ([
        { icon: Handshake, label: 'Completed collabs', value: String(biz.completedCollaborations) },
        { icon: Users, label: 'Creators partnered', value: String(biz.totalPartners) },
        monthYear(biz.memberSince)
          ? { icon: CalendarDays, label: 'On Influnet since', value: monthYear(biz.memberSince)! }
          : null,
        {
          icon: ShieldCheck,
          label: 'Verification',
          value: biz.isVerified
            ? 'Verified'
            : biz.approvalStatus === 'approved'
              ? 'Approved'
              : 'Unverified',
        },
      ].filter(Boolean) as { icon: typeof Handshake; label: string; value: string }[])
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <SkeletonCard />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : !biz || !res ? (
          <ErrorState message="You don't have access to this profile." />
        ) : (
          <>
            {/* Same private-view notice the web page shows a non-owner — this
                is visible ONLY because of a live relationship, and that is
                worth saying so it doesn't read as a public page. */}
            {!isOwner ? (
              <Card
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: t.spacing.sm,
                  backgroundColor: t.color.brandSoft,
                  borderColor: t.color.brand + '33',
                }}
              >
                <Lock size={16} color={t.color.brand} style={{ marginTop: 2 }} />
                <Txt variant="footnote" tone="soft" style={{ flex: 1 }}>
                  This brand profile is private. You can see it because you have an active
                  request or project with them — it isn&apos;t visible to anyone else.
                </Txt>
              </Card>
            ) : null}

            <Card raised style={{ gap: t.spacing.md, alignItems: 'center' }}>
              <Avatar uri={biz.avatarUrl} name={biz.name} size={76} />
              <View style={{ alignItems: 'center', gap: 3 }}>
                <Txt variant="title1" center>
                  {biz.name}
                </Txt>
                {biz.industry || biz.location ? (
                  <Txt variant="callout" tone="muted">
                    {[biz.industry, biz.location].filter(Boolean).join(' · ')}
                  </Txt>
                ) : null}
              </View>

              {biz.isVerified ? <Badge label="Verified brand" tone="ok" /> : null}

              <Txt variant="body" tone="soft" center>
                {biz.mission || 'This brand partners with creators on Influnet.'}
              </Txt>

              {isOwner ? (
                <Badge label="This is what creators you work with see" tone="brand" />
              ) : null}
            </Card>

            {stats.length > 0 ? (
              <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md }}>
                {stats.map((s) => (
                  <View key={s.label} style={{ minWidth: '42%', flex: 1, gap: 4 }}>
                    <s.icon size={16} color={t.color.brand} />
                    <Txt variant="title3" style={{ fontVariant: ['tabular-nums'] }}>
                      {s.value}
                    </Txt>
                    <Txt variant="caption" tone="muted">
                      {s.label}
                    </Txt>
                  </View>
                ))}
              </Card>
            ) : null}

            {biz.brandStory ? (
              <>
                <SectionLabel>About the brand</SectionLabel>
                <Card>
                  <Txt variant="body" tone="soft">
                    {biz.brandStory}
                  </Txt>
                  {biz.website ? (
                    <Txt variant="footnote" style={{ color: t.color.brand, marginTop: t.spacing.md, fontWeight: '600' }}>
                      <Globe size={13} color={t.color.brand} /> {biz.website.replace(/^https?:\/\//, '')}
                    </Txt>
                  ) : null}
                </Card>
              </>
            ) : null}

            {biz.products || biz.services ? (
              <>
                <SectionLabel>What they offer</SectionLabel>
                <Card style={{ gap: t.spacing.md }}>
                  {biz.products ? (
                    <View style={{ gap: 2 }}>
                      <Txt variant="footnote" style={{ fontWeight: '700' }}>
                        Products
                      </Txt>
                      <Txt variant="body" tone="soft">
                        {biz.products}
                      </Txt>
                    </View>
                  ) : null}
                  {biz.services ? (
                    <View style={{ gap: 2 }}>
                      <Txt variant="footnote" style={{ fontWeight: '700' }}>
                        Services
                      </Txt>
                      <Txt variant="body" tone="soft">
                        {biz.services}
                      </Txt>
                    </View>
                  ) : null}
                </Card>
              </>
            ) : null}

            {biz.teamSize || biz.businessType ? (
              <Card style={{ flexDirection: 'row', gap: t.spacing.lg }}>
                {biz.businessType ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
                    <Briefcase size={15} color={t.color.contentSoft} />
                    <Txt variant="footnote" tone="soft">
                      {biz.businessType}
                    </Txt>
                  </View>
                ) : null}
                {biz.teamSize ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
                    <Users size={15} color={t.color.contentSoft} />
                    <Txt variant="footnote" tone="soft">
                      {biz.teamSize} team
                    </Txt>
                  </View>
                ) : null}
                {biz.location ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
                    <MapPin size={15} color={t.color.contentSoft} />
                    <Txt variant="footnote" tone="soft">
                      {biz.location}
                    </Txt>
                  </View>
                ) : null}
              </Card>
            ) : null}
          </>
        )}
      </ScreenScroll>

      {biz && res ? (
        <StickyFooter>
          {isOwner ? (
            <Button label="Edit profile" onPress={() => router.push('/edit-profile')} />
          ) : (
            <Button label="Message this brand" loading={messaging} onPress={() => void messageBrand()} />
          )}
        </StickyFooter>
      ) : null}
    </View>
  );
}
