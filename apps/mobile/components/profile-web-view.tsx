/**
 * The web public profile, embedded.
 *
 * The client wants the app to show the *actual* web `/<username>` page — the
 * one visitors see on the site — not a native re-render of it. This wraps that
 * page in a WebView with a native header (back + share), loading it with
 * `?app=1` so the web side strips its own masthead, owner edit bar and
 * "Work with me" CTAs (see CreatorProfileViewComponent's `embedded` prop).
 *
 * Navigations OUT of the profile — a tapped Instagram/YouTube link, or any
 * /dashboard or /login URL — are opened in the system browser instead of
 * taking over the WebView, so the embed can only ever be the profile.
 */
import { useRef, useState } from 'react';
import { ActivityIndicator, Share, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { ArrowLeft, Share2 } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { API_BASE_URL } from '@/lib/supabase';
import { PressableScale, Txt } from '@/components/ui';

export function ProfileWebView({
  username,
  title,
}: {
  username: string;
  title?: string;
}) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ref = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const origin = API_BASE_URL.replace(/\/$/, '');
  const startUrl = `${origin}/${encodeURIComponent(username)}?app=1`;
  const profilePath = `/${username}`.toLowerCase();

  /**
   * Keep the WebView on the profile page only. The first load and any reload
   * of the profile itself are allowed; a link to another site, or to a
   * dashboard/login URL, opens externally.
   */
  function allowNavigation(req: WebViewNavigation): boolean {
    const url = req.url;
    if (url === startUrl || url === `${origin}${profilePath}` || url === `${origin}${profilePath}/`) {
      return true;
    }
    if (url.startsWith('about:') || url.startsWith('data:')) return true;
    // The media-kit sub-page is still "this profile" — keep it inline.
    if (url.startsWith(`${origin}${profilePath}/media-kit`)) return true;
    // Everything else: open outside, don't navigate the embed.
    void Linking.openURL(url).catch(() => {});
    return false;
  }

  async function share() {
    try {
      await Share.share({ url: `${origin}/${username}`, message: `${origin}/${username}` });
    } catch {
      /* dismissed */
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      {/* Native header — the one bit of chrome that stays native. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          paddingHorizontal: t.spacing.screen,
          paddingTop: insets.top + t.spacing.sm,
          paddingBottom: t.spacing.sm,
          backgroundColor: t.color.surfaceCard,
          borderBottomWidth: 1,
          borderBottomColor: t.color.hairline,
        }}
      >
        <PressableScale onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft size={22} color={t.color.content} />
        </PressableScale>
        <Txt variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
          {title ?? `@${username}`}
        </Txt>
        <PressableScale onPress={share} accessibilityLabel="Share profile">
          <Share2 size={20} color={t.color.content} />
        </PressableScale>
      </View>

      <View style={{ flex: 1 }}>
        <WebView
          ref={ref}
          source={{ uri: startUrl }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
          onShouldStartLoadWithRequest={allowNavigation}
          allowsBackForwardNavigationGestures={false}
          setSupportMultipleWindows={false}
          // The page renders its own scroll; the WebView is just the surface.
          style={{ flex: 1, backgroundColor: t.color.surface }}
        />

        {loading && !failed ? (
          <View
            style={{
              ...StyleSheetAbsoluteFill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: t.color.surface,
            }}
          >
            <ActivityIndicator color={t.color.brand} />
          </View>
        ) : null}

        {failed ? (
          <View
            style={{
              ...StyleSheetAbsoluteFill,
              alignItems: 'center',
              justifyContent: 'center',
              padding: t.spacing.xl,
              gap: t.spacing.sm,
              backgroundColor: t.color.surface,
            }}
          >
            <Txt variant="bodyStrong">Couldn&apos;t load this profile</Txt>
            <Txt variant="footnote" tone="muted" center>
              Check your connection and try again.
            </Txt>
            <PressableScale
              onPress={() => {
                setFailed(false);
                ref.current?.reload();
              }}
            >
              <Txt variant="footnote" tone="brand">
                Retry
              </Txt>
            </PressableScale>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const StyleSheetAbsoluteFill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};
