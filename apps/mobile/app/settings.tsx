import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Switch, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import {
  Bell,
  CirclePlay,
  Lightbulb,
  Megaphone,
  LifeBuoy,
  LogOut,
  Mail,
  MessageSquareHeart,
  PlayCircle,
  RotateCcw,
  ShieldOff,
  Sparkles,
  Trash2,
} from 'lucide-react-native';
import { useGuides } from '@/components/guides/use-guides';
import { useTheme } from '@/lib/theme';
import { LAST_COMMIT_TIME } from '@/lib/build-info';
import { useSession, useSignOutAction } from '@/lib/session';
import { API_BASE_URL } from '@/lib/supabase';
import { endpoints } from '@/lib/api';
import {
  Button,
  Card,
  ListGroup,
  ListRow,
  ScreenScroll,
  SectionLabel,
  Sheet,
  Txt,
  type SheetRef,
} from '@/components/ui';


// Only accounts in this list will see internal diagnostic tools in Settings.
const DEVELOPER_EMAILS = [
  'vimal@gmail.com',
];

export default function SettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const resetGuides = useGuides((s) => s.resetSeen);
  const guidesSeen = useGuides((s) => s.seen.length);
  const { profile } = useSession();
  const { signOut, signingOut } = useSignOutAction();
  const deleteSheet = useRef<SheetRef>(null);
  const [deleteReason, setDeleteReason] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  /**
   * In-app account deletion (App Store guideline 5.1.1(v): an account created
   * in the app has to be deletable in the app). The server records a tombstone
   * before the delete and refuses while a project is still active — that 409 is
   * shown here rather than treated as a failure.
   */
  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    const res = await endpoints.deleteAccount<{ ok?: boolean }>(
      deleteReason ? { reason_code: deleteReason } : undefined,
    );
    setDeleting(false);
    if (!res.ok) {
      setDeleteError(res.error || 'We could not delete your account. Please try again.');
      return;
    }
    deleteSheet.current?.close();
    await signOut();
  };
  const [testingPush, setTestingPush] = useState(false);
  // Re-engagement nudges opt-out (migration 142). Optimistic — the Switch
  // shows the new state immediately and reconciles if the PATCH fails.
  const [nudgesOff, setNudgesOff] = useState<boolean>(Boolean(profile?.nudges_opt_out));
  useEffect(() => {
    setNudgesOff(Boolean(profile?.nudges_opt_out));
  }, [profile]);

  async function toggleNudges(next: boolean) {
    setNudgesOff(next);
    const res = await endpoints.updateProfile({ nudges_opt_out: next });
    if (!res.ok) {
      setNudgesOff(!next);
      Alert.alert('Could not save', res.error ?? 'Please try again.');
    }
  }

  /**
   * Per-category opt-out for admin broadcasts (migration 157). Transactional
   * notifications — stage changes, payments, messages — are deliberately not
   * listed: switching those off would break the product, not reduce noise.
   */
  const [prefs, setPrefs] = useState<Record<string, { push: boolean; email: boolean }>>({});
  useEffect(() => {
    void (async () => {
      const res = await endpoints.notificationPreferences<{ preferences: Record<string, { push: boolean; email: boolean }> }>();
      if (res.ok && res.data?.preferences) setPrefs(res.data.preferences);
    })();
  }, []);

  async function togglePref(category: 'announcements' | 'promotions' | 'tips', push: boolean) {
    const previous = prefs[category] ?? { push: true, email: true };
    setPrefs((p) => ({ ...p, [category]: { ...previous, push } }));
    const res = await endpoints.setNotificationPreference({ category, push });
    if (!res.ok) {
      setPrefs((p) => ({ ...p, [category]: previous }));
      Alert.alert('Could not save', res.error ?? 'Please try again.');
    }
  }

  const showDiagnostics =
    Boolean(profile?.email) && DEVELOPER_EMAILS.includes(String(profile?.email).toLowerCase());

  async function testPushRegistration() {
    setTestingPush(true);
    try {
      if (!Device.isDevice) {
        Alert.alert("Push Error", "This is not a physical device. Push tokens require a physical Android or iOS device.");
        return;
      }
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status;
      }
      if (status !== 'granted') {
        Alert.alert("Permission Denied", `Notification permission is '${status}'. Please go to Android Settings -> Apps -> Influnet and turn on Notifications.`);
        return;
      }
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) {
        Alert.alert("Configuration Error", "No EAS projectId configured in this build.");
        return;
      }
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      const res = await endpoints.registerPushToken<{ ok?: boolean; reason?: string }>(token);
      // The route answers 200 even when it could not STORE the token, so the
      // body is the verdict — checking res.ok alone reported success on a
      // write that never happened.
      if (!res.ok || res.data?.ok !== true) {
        Alert.alert(
          'Server Registration Failed',
          `Got a token from Expo, but the server did not store it.\n\n` +
            `Reason: ${res.data?.reason ?? res.error ?? 'unknown'}\n\nToken: ${token.slice(0, 30)}...`,
        );
        return;
      }
      Alert.alert("Push Registered Successfully! 🎉", `Token: ${token.slice(0, 30)}...\n\nYour device is now registered to receive push notifications! Check 'npm run check:push' now.`);
    } catch (err: any) {
      Alert.alert("Push Registration Error", err?.message ?? String(err));
    } finally {
      setTestingPush(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenScroll>
        <SectionLabel>Account</SectionLabel>
        <Card style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt variant="footnote" tone="muted">
              Signed in as
            </Txt>
            <Txt variant="footnote">{profile?.email}</Txt>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt variant="footnote" tone="muted">
              Account type
            </Txt>
            <Txt variant="footnote">
              {profile?.role === 'influencer'
                ? 'Creator'
                : profile?.role === 'admin'
                  ? 'Admin'
                  : 'Business'}
            </Txt>
          </View>
        </Card>

        {showDiagnostics ? (
          <>
            <SectionLabel>Diagnostics (Developer Only)</SectionLabel>
            <ListGroup>
              <ListRow
                title="Test Push Notifications"
                subtitle={testingPush ? "Registering and verifying token..." : "Verify FCM token registration with server"}
                left={<Bell size={19} color={t.color.brand} />}
                onPress={testPushRegistration}
              />
            </ListGroup>
          </>
        ) : null}

        {profile?.role === 'influencer' ? (
          <>
            <SectionLabel>Verification</SectionLabel>
            <ListGroup>
              <ListRow
                title="How to verify"
                subtitle="Watch a quick guide — copy your link, paste it in your Instagram links"
                left={<PlayCircle size={19} color={t.color.brand} />}
                onPress={() => router.push('/verification-guide')}
              />
            </ListGroup>
          </>
        ) : null}

        <SectionLabel>Help</SectionLabel>
        <ListGroup>
          <ListRow
            title="How things work"
            subtitle="Every short walkthrough, in one place"
            left={<CirclePlay size={19} color={t.color.brand} />}
            onPress={() => router.push('/guides' as Href)}
          />
          <ListRow
            title="Replay product guides"
            subtitle={
              guidesSeen > 0
                ? `${guidesSeen} watched — auto-play them all again`
                : 'Auto-play a section’s guide the first time you open it'
            }
            left={<RotateCcw size={19} color={t.color.contentSoft} />}
            onPress={() => {
              resetGuides();
              Alert.alert('Guides reset', 'Each section’s walkthrough will play once again next time you open it.');
            }}
          />
          <ListRow
            title="Help & support"
            subtitle="Ask us anything — a real person reads every request"
            left={<LifeBuoy size={19} color={t.color.brand} />}
            onPress={() => router.push('/support')}
          />
          <ListRow
            title="Send feedback"
            subtitle="An idea, something confusing, or something we got right"
            left={<MessageSquareHeart size={19} color={t.color.contentSoft} />}
            onPress={() => router.push('/feedback')}
          />
        </ListGroup>

        <SectionLabel>Notifications</SectionLabel>
        <ListGroup>
          <ListRow
            title="Reminders when you're away"
            subtitle="Unread messages, projects waiting on you, new campaigns"
            left={<Bell size={19} color={t.color.contentSoft} />}
            right={
              <Switch
                value={!nudgesOff}
                onValueChange={(on) => toggleNudges(!on)}
                trackColor={{ true: t.color.brand, false: t.color.hairlineStrong }}
                thumbColor={t.color.white}
                style={{ transform: [{ scale: 0.85 }] }}
                accessibilityLabel="Reminders when you're away"
              />
            }
          />
          {BROADCAST_PREFS.map((pref) => (
            <ListRow
              key={pref.category}
              title={pref.title}
              subtitle={pref.subtitle}
              left={<pref.icon size={19} color={t.color.contentSoft} />}
              right={
                <Switch
                  value={prefs[pref.category]?.push ?? true}
                  onValueChange={(on) => togglePref(pref.category, on)}
                  trackColor={{ true: t.color.brand, false: t.color.hairlineStrong }}
                  thumbColor={t.color.white}
                  style={{ transform: [{ scale: 0.85 }] }}
                  accessibilityLabel={pref.title}
                />
              }
            />
          ))}
        </ListGroup>
        <Txt variant="caption" tone="muted" style={{ marginTop: -6, paddingHorizontal: 4 }}>
          Messages, project updates and payment alerts always come through — those are the product working.
        </Txt>

        <SectionLabel>Privacy</SectionLabel>
        <ListGroup>
          <ListRow
            title="Blocked accounts"
            subtitle="People who can’t contact you"
            left={<ShieldOff size={19} color={t.color.contentSoft} />}
            onPress={() => router.push('/blocked-accounts')}
          />
        </ListGroup>

        {profile?.role === 'admin' ? (
          <Card style={{ gap: 4 }}>
            <Txt variant="bodyStrong">Admin tools are on the web</Txt>
            <Txt variant="footnote" tone="muted">
              Approvals, user management and reports are dense, desk-shaped work.
              Sign in at {API_BASE_URL.replace(/^https?:\/\//, '')} to use them.
            </Txt>
          </Card>
        ) : null}

        <SectionLabel>Danger zone</SectionLabel>
        <ListGroup>
          <ListRow
            title="Delete account"
            subtitle="Permanently remove your account and data"
            left={<Trash2 size={19} color={t.color.danger} />}
            onPress={() => deleteSheet.current?.expand()}
          />
        </ListGroup>

        <Button
          label="Sign out"
          variant="secondary"
          icon={<LogOut size={16} color={t.color.content} />}
          // Sign out first, then navigate — never the other way round. Navigating
          // while the session is still live re-mounts screens that immediately
          // fetch, and those requests then 401 as the token disappears under
          // them. useSignOutAction owns that ordering, the '/' destination, the
          // error handling and the busy state, so every Sign out button agrees.
          loading={signingOut}
          onPress={signOut}
        />

        <Txt variant="caption" tone="muted" center>
          Influnet {Constants.expoConfig?.version ?? ''}
        </Txt>
        <Txt variant="caption" tone="muted" center>
          {Updates.isEmbeddedLaunch
            ? 'Running embedded build'
            : Updates.createdAt
              ? `Updated ${Updates.createdAt.toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })} at ${Updates.createdAt.toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : 'No OTA update info'}
        </Txt>
        {showDiagnostics && Updates.updateId ? (
          <Txt variant="caption" tone="muted" center>
            Update ID: {Updates.updateId.slice(0, 8)}
          </Txt>
        ) : null}
        <Txt variant="caption" tone="muted" center>
          Build Time: {LAST_COMMIT_TIME}
        </Txt>

      </ScreenScroll>

      {/* Sibling of ScreenScroll, never a child of it. Nested inside the
          scroll view this sheet flashed open on its own the moment Settings
          mounted, with nothing pressed — gorhom's BottomSheet expects a
          sibling of a fixed-size container, and measuring itself against
          unbounded scroll content made it resolve to an open snap point
          instead of the index={-1} it was given. Same fix, same reason, as
          the sheets on apps/mobile/app/projects/[id]/index.tsx — see the note
          at the top of that file. Settings was the last screen still nesting
          one. */}
      <Sheet ref={deleteSheet} title="Delete your account?">
        <Txt variant="body" tone="soft">
          This permanently removes your profile, your projects and your messages.
          It cannot be undone. Active projects have to be completed or cancelled
          first, so nobody is left mid-deal.
        </Txt>
        <Txt variant="footnote" tone="muted">
          Tell us why, if you like — it is the only thing we keep, and it is not
          linked to your name or email.
        </Txt>

        <View style={{ gap: 8, marginTop: 4 }}>
          {DELETE_REASONS.map((r) => (
            <Pressable
              key={r.code}
              onPress={() => setDeleteReason(r.code)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: deleteReason === r.code ? t.color.brand : t.color.hairline,
                backgroundColor: deleteReason === r.code ? t.color.brandSoft : t.color.surfaceCard,
                paddingVertical: 10,
                paddingHorizontal: 12,
              }}
            >
              <Txt variant="body">{r.label}</Txt>
            </Pressable>
          ))}
        </View>

        {deleteError ? (
          <Txt variant="footnote" style={{ color: t.color.danger }}>
            {deleteError}
          </Txt>
        ) : null}

        <Button
          label={deleting ? 'Deleting…' : 'Delete my account'}
          variant="danger"
          loading={deleting}
          icon={<Trash2 size={16} color={t.color.white} />}
          onPress={() => {
            Alert.alert(
              'Delete your account?',
              'Everything is removed permanently. This cannot be undone.',
              [
                { text: 'Keep my account', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => void confirmDelete() },
              ],
            );
          }}
        />
        <Button
          label="Email support instead"
          variant="ghost"
          icon={<Mail size={16} color={t.color.content} />}
          onPress={() => {
            void Linking.openURL(
              `mailto:support@influnet.in?subject=Delete my account&body=Please delete the account for ${profile?.email ?? ''}.`
            );
            deleteSheet.current?.close();
          }}
        />
      </Sheet>
    </View>
  );
}

/** Why people leave. Kept short — a long list gets skipped entirely. */
const DELETE_REASONS: { code: string; label: string }[] = [
  { code: 'not_useful', label: "It wasn't useful for me" },
  { code: 'privacy', label: 'Privacy concerns' },
  { code: 'duplicate', label: 'I have another account' },
  { code: 'found_alternative', label: 'I found another platform' },
  { code: 'bad_experience', label: 'I had a bad experience' },
  { code: 'other', label: 'Something else' },
];

/** Marketing-ish notification categories a person may switch off (migration 157). */
const BROADCAST_PREFS: {
  category: 'announcements' | 'promotions' | 'tips';
  title: string;
  subtitle: string;
  icon: typeof Bell;
}[] = [
  { category: 'announcements', title: 'Product announcements', subtitle: 'New features and important changes', icon: Megaphone },
  { category: 'promotions', title: 'Offers', subtitle: 'Discounts and Pro offers', icon: Sparkles },
  { category: 'tips', title: 'Tips and guides', subtitle: 'Ideas for getting more out of Influnet', icon: Lightbulb },
];
