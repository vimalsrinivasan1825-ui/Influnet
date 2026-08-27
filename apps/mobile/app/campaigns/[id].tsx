/**
 * Campaign detail — brief, apply (creator) or manage applicants (owner).
 *
 * Was entirely missing: the campaigns list screen pushed to `/projects/${c.id}`,
 * which is not a route a campaign id resolves on (campaign ids are uuids,
 * project ids are bigints) — so tapping any campaign card was a dead link and
 * a creator could not actually apply from the app. This is the screen that
 * link should have opened.
 *
 * "Accept & message" is C4, the hand-off: it calls the same
 * accept_campaign_application RPC the web page uses, which creates the
 * conversation everything downstream (terms, project, payments) already
 * knows how to run.
 */
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, Check, Heart, MapPin, MessageSquare, Users, X } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import {
  Badge,
  Button,
  Card,
  ChipWrap,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  ScreenScroll,
  SkeletonCard,
  Txt,
} from '@/components/ui';

interface Campaign {
  id: string;
  title: string;
  description: string;
  deliverables: string;
  platforms: string[];
  budget_min: number | null;
  budget_max: number | null;
  delivery_by: string | null;
  follower_min: number | null;
  categories: string[];
  location: string | null;
  status: string;
  business_user?: { id: string; name: string | null } | null;
}

interface Application {
  id: string;
  pitch: string;
  proposed_rate: number | null;
  status: string;
  creator?: { id: string; name: string | null } | null;
}

export default function CampaignDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const myUserId = useSession((s) => s.session?.user.id);
  const role = useSession((s) => s.profile?.role ?? null);

  const [pitch, setPitch] = useState('');
  const [rate, setRate] = useState('');
  const [applying, setApplying] = useState(false);
  const [saved, setSaved] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [campRes, appsRes, savedRes] = await Promise.all([
      endpoints.getCampaign<{ campaign: Campaign }>(id),
      endpoints.listCampaignApplications<{ applications: Application[] }>(id),
      endpoints.listSavedItems<{ items: { id: string; kind: string; target_id: string }[] }>(),
    ]);
    if (!campRes.ok || !campRes.data) {
      return { ok: false as const, status: campRes.status, data: null, error: campRes.error ?? 'Could not load this campaign.' };
    }
    const mySavedRow = savedRes.ok
      ? savedRes.data?.items.find((it) => it.kind === 'campaign' && it.target_id === id)
      : undefined;
    return {
      ok: true as const,
      status: 200,
      error: null,
      data: {
        campaign: campRes.data.campaign,
        applications: appsRes.ok ? appsRes.data?.applications ?? [] : [],
        savedItemId: mySavedRow?.id ?? null,
      },
    };
  }, [id]);

  const { data, error, loading, refreshing, refresh } = useFetch(load);

  const campaign = data?.campaign;
  const applications = data?.applications ?? [];
  const isOwner = campaign?.business_user?.id === myUserId;
  const myApplication = applications.find((a) => a.creator?.id === myUserId);

  async function toggleSave() {
    if (!campaign) return;
    setSaved(true);
    if (data?.savedItemId) {
      await endpoints.unsaveItem(data.savedItemId);
    } else {
      await endpoints.saveItem('campaign', campaign.id);
    }
    setSaved(false);
    refresh();
  }

  async function submitApplication() {
    if (pitch.trim().length < 10) return;
    setApplying(true);
    const res = await endpoints.applyToCampaign(id, {
      pitch: pitch.trim(),
      proposed_rate: rate ? Number(rate) : undefined,
    });
    setApplying(false);
    if (res.ok) {
      setPitch('');
      setRate('');
      refresh();
    }
  }

  async function actOn(appId: string, action: 'shortlist' | 'decline' | 'accept' | 'withdraw') {
    setActingOn(appId);
    const res = await endpoints.updateApplicationStatus<{ conversation_id?: string | null }>(id, appId, { action });
    setActingOn(null);
    if (res.ok && action === 'accept' && res.data?.conversation_id) {
      const applicant = applications.find((a) => a.id === appId);
      router.push({
        pathname: '/conversations/[id]',
        params: { id: res.data.conversation_id, name: applicant?.creator?.name ?? 'Creator' },
      });
      return;
    }
    refresh();
  }

  if (loading) {
    return (
      <ScreenScroll>
        <SkeletonCard />
        <SkeletonCard />
      </ScreenScroll>
    );
  }

  if (error || !campaign) {
    return (
      <ScreenScroll>
        <ErrorState message={error ?? 'Campaign not found'} onRetry={refresh} />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      <View style={{ gap: t.spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: t.spacing.sm }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="title2">{campaign.title}</Txt>
            <Txt variant="footnote" tone="muted">By {campaign.business_user?.name || 'Brand'}</Txt>
          </View>
          {!isOwner && (
            <Button
              variant="secondary"
              size="md"
              label={data?.savedItemId ? 'Saved' : 'Save'}
              icon={<Heart size={16} color={t.color.brand} fill={data?.savedItemId ? t.color.brand : 'transparent'} />}
              loading={saved}
              onPress={toggleSave}
              inline
            />
          )}
        </View>

        <Card style={{ gap: t.spacing.md }}>
          {campaign.description ? <Txt variant="body" tone="soft">{campaign.description}</Txt> : null}
          {campaign.deliverables ? (
            <View style={{ gap: 2 }}>
              <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Deliverables
              </Txt>
              <Txt variant="body">{campaign.deliverables}</Txt>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
            {campaign.budget_min != null && (
              <Txt variant="caption" tone="muted">From ₹{campaign.budget_min.toLocaleString('en-IN')}</Txt>
            )}
            {campaign.delivery_by && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Calendar size={12} color={t.color.contentMuted} />
                <Txt variant="caption" tone="muted">
                  {new Date(campaign.delivery_by).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </Txt>
              </View>
            )}
            {campaign.location && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <MapPin size={12} color={t.color.contentMuted} />
                <Txt variant="caption" tone="muted">{campaign.location}</Txt>
              </View>
            )}
            {campaign.follower_min && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Users size={12} color={t.color.contentMuted} />
                <Txt variant="caption" tone="muted">{campaign.follower_min.toLocaleString('en-IN')}+ followers</Txt>
              </View>
            )}
          </View>
          {campaign.categories.length > 0 && (
            <ChipWrap>
              {campaign.categories.map((c) => <Chip key={c} label={c} />)}
            </ChipWrap>
          )}
        </Card>

        {/* Apply — creator, not the owner, hasn't already applied */}
        {role === 'influencer' && !isOwner && !myApplication && (
          <Card style={{ gap: t.spacing.md }}>
            <Txt variant="bodyStrong">Apply to this campaign</Txt>
            <Field
              label="Pitch"
              value={pitch}
              onChangeText={setPitch}
              placeholder="Why are you a good fit?"
              multiline
            />
            <Field
              label="Proposed rate (₹, optional)"
              value={rate}
              onChangeText={(v) => setRate(v.replace(/[^0-9]/g, ''))}
              placeholder="Your rate"
              keyboardType="number-pad"
            />
            <Button
              label="Submit application"
              onPress={submitApplication}
              loading={applying}
              disabled={pitch.trim().length < 10}
            />
          </Card>
        )}

        {/* This creator's own application status */}
        {myApplication && (
          <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
              <Txt variant="body">Your application</Txt>
              <Badge label={myApplication.status} tone={myApplication.status === 'accepted' ? 'ok' : 'neutral'} />
            </View>
            {myApplication.status === 'applied' && (
              <Button
                variant="ghost"
                size="md"
                label="Withdraw"
                onPress={() => actOn(myApplication.id, 'withdraw')}
                inline
              />
            )}
          </Card>
        )}

        {/* Applicants — owner only */}
        {isOwner && (
          <View style={{ gap: t.spacing.sm }}>
            <Txt variant="bodyStrong">Applications ({applications.length})</Txt>
            {applications.length === 0 ? (
              <Card>
                <EmptyState icon={<Users />} title="No applications yet" body="Creators will appear here when they apply." />
              </Card>
            ) : (
              applications.map((app) => (
                <Card key={app.id} style={{ gap: t.spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                    <Txt variant="bodyStrong" style={{ flex: 1 }}>{app.creator?.name || 'Creator'}</Txt>
                    <Badge
                      label={app.status}
                      tone={app.status === 'shortlisted' || app.status === 'accepted' ? 'ok' : app.status === 'declined' ? 'danger' : 'neutral'}
                    />
                  </View>
                  <Txt variant="footnote" tone="soft">{app.pitch}</Txt>
                  {app.proposed_rate ? (
                    <Txt variant="caption" tone="muted">Rate: ₹{app.proposed_rate.toLocaleString('en-IN')}</Txt>
                  ) : null}
                  {(app.status === 'applied' || app.status === 'shortlisted') && (
                    <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                      {app.status === 'applied' && (
                        <>
                          <Button
                            variant="secondary"
                            size="md"
                            label="Decline"
                            icon={<X size={14} color={t.color.content} />}
                            loading={actingOn === app.id}
                            onPress={() => actOn(app.id, 'decline')}
                            inline
                          />
                          <Button
                            variant="secondary"
                            size="md"
                            label="Shortlist"
                            icon={<Check size={14} color={t.color.content} />}
                            loading={actingOn === app.id}
                            onPress={() => actOn(app.id, 'shortlist')}
                            inline
                          />
                        </>
                      )}
                      <Button
                        variant="primary"
                        size="md"
                        label="Accept & message"
                        icon={<MessageSquare size={14} color={t.color.white} />}
                        loading={actingOn === app.id}
                        onPress={() => actOn(app.id, 'accept')}
                        inline
                      />
                    </View>
                  )}
                </Card>
              ))
            )}
          </View>
        )}
      </View>
    </ScreenScroll>
  );
}
