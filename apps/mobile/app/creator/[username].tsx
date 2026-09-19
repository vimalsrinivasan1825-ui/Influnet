/**
 * A creator's public profile.
 *
 * The body is the REAL web `/<username>` page in a WebView (see
 * components/profile-web-view.tsx) — the client wanted the app to show exactly
 * what a visitor sees on the site, not a native re-render that can drift from
 * it. This needs react-native-webview, so a build without it renders a blank
 * body; every current build ships with it.
 *
 * What stays native: the action footer. A business viewer gets "Work with me" /
 * "View project"; a creator viewer gets "Request to collaborate" (peer collab,
 * metered on Free). Both come from /api/creators/[username], the same endpoint
 * the web overlay uses, so the gate can't be bypassed from the client.
 */
import { useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Flag, Handshake } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { ProfileWebView } from '@/components/profile-web-view';
import { Button, StickyFooter } from '@/components/ui';
import type { SheetRef } from '@/components/ui/sheet';
import { ReportSheet } from '@/components/report-sheet';

type CtaAction = 'edit' | 'work_with_me' | 'request_sent' | 'view_project' | 'view_only';

interface CreatorProfileResponse {
  data: { name: string; username: string };
  isOwner: boolean;
  ctaLabel: string;
  ctaAction: CtaAction;
  ctaProjectId: string | null;
  userId: string;
  availabilityStatus: string | null;
}

export default function CreatorDetail() {
  const t = useTheme();
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();
  const myRole = useSession((s) => s.profile?.role);
  const [sendingPeer, setSendingPeer] = useState(false);
  const reportSheet = useRef<SheetRef>(null);

  // Only used for the action footer — the profile itself is the WebView.
  const { data: res } = useFetch(
    () => endpoints.getCreatorProfile<CreatorProfileResponse>(username),
    { cacheKey: `creator-cta:${username}` },
  );
  const name = res?.data?.name;

  const canReport = !!res && !res.isOwner && !!res.userId;

  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      {/* The profile itself is a web page, so report/block lives in the native
          header (App Store 1.2) rather than inside the WebView. */}
      {canReport ? (
        <Stack.Screen
          options={{
            headerRight: () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Report or block ${name ?? 'this creator'}`}
                onPress={() => reportSheet.current?.expand()}
                hitSlop={10}
                style={{ paddingHorizontal: 8 }}
              >
                <Flag size={20} color={t.color.contentSoft} />
              </Pressable>
            ),
          }}
        />
      ) : null}
      <ProfileWebView username={username} title={name} />

      {/* Business viewer → work-with-me / view-project. Owner and view-only get
          nothing here. */}
      {res && !res.isOwner && res.ctaAction !== 'view_only' && res.ctaAction !== 'edit' ? (
        <StickyFooter>
          <Button
            label={res.ctaLabel}
            disabled={res.ctaAction === 'request_sent'}
            onPress={() => {
              if (res.ctaAction === 'work_with_me') {
                router.push({ pathname: '/requests/new', params: { to: res.userId, name: name ?? username } });
              } else if (res.ctaAction === 'view_project' && res.ctaProjectId) {
                router.push({ pathname: '/projects/[id]', params: { id: res.ctaProjectId } });
              }
            }}
          />
        </StickyFooter>
      ) : res && !res.isOwner && myRole === 'influencer' ? (
        <StickyFooter>
          <Button
            label={sendingPeer ? 'Sending…' : 'Request to collaborate'}
            loading={sendingPeer}
            icon={<Handshake size={16} color={t.color.white} />}
            onPress={() => {
              Alert.alert(
                `Collaborate with ${name ?? 'this creator'}?`,
                'They get a request they can accept to open a conversation with you.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Send request',
                    onPress: async () => {
                      setSendingPeer(true);
                      const r = await endpoints.createPeerCollab({ to_user_id: res.userId });
                      setSendingPeer(false);
                      Alert.alert(
                        r.ok ? 'Request sent' : r.status === 402 ? 'Monthly limit reached' : 'Could not send',
                        r.ok
                          ? `${name ?? 'The creator'} will see your request.`
                          : r.error ?? 'Please try again.',
                      );
                    },
                  },
                ],
              );
            }}
          />
        </StickyFooter>
      ) : null}

      {canReport && res ? (
        <ReportSheet
          sheetRef={reportSheet}
          reportedId={res.userId}
          reportedName={name ?? 'this creator'}
          context={{ kind: 'profile' }}
        />
      ) : null}
    </View>
  );
}
