/**
 * The web public profile, embedded.
 *
 * Shows the actual web `/<username>` page in a WebView (native header + share),
 * loaded with `?app=1` so the web side strips its own masthead / owner bar /
 * CTAs (see CreatorProfileViewComponent's `embedded` prop).
 *
 * ── react-native-webview is a NATIVE module ──────────────────────────────
 * It ships in the binary, not the JS bundle. An OTA update that reaches a
 * build WITHOUT it (the state during the rollout) would otherwise crash on
 * render — on the New Architecture, hard. So the module is loaded through a
 * guarded require and, when it isn't there, this falls back to opening the
 * profile in the system browser (which is what the old "Open web version" row
 * did anyway). Every build from the WebView release onward has the module and
 * takes the embed path.
 */
import { Component, type ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { ArrowLeft, Share2 } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { API_BASE_URL } from '@/lib/supabase';
import { Button, Card, PressableScale, Screen, Txt } from '@/components/ui';

// Guarded — see the header. `WebViewComponent` is undefined on a build whose
// binary predates the native module.
let WebViewComponent: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebViewComponent = require('react-native-webview').WebView;
} catch {
  WebViewComponent = undefined;
}
const HAS_WEBVIEW = !!WebViewComponent;

/**
 * Render-error boundary for the WebView path.
 *
 * On the New Architecture, a build whose binary lacks the RNCWebView view
 * manager doesn't fail at `require` — it fails when React mounts the component
 * ("Unable to find viewmanager 'RNCWebView'"). The require guard above catches
 * neither that nor a bundle mismatch, so this catches the mount and falls
 * straight through to the browser instead of the red screen.
 */
class WebViewGuard extends Component<
  { url: string; title: string; children: ReactNode },
  { crashed: boolean }
> {
  state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  render() {
    if (this.state.crashed) {
      return <BrowserFallback url={this.props.url} title={this.props.title} />;
    }
    return this.props.children;
  }
}

export function ProfileWebView(props: { username: string; title?: string }) {
  const origin = API_BASE_URL.replace(/\/$/, '');
  const publicUrl = `${origin}/${encodeURIComponent(props.username)}`;
  const title = props.title ?? `@${props.username}`;

  // Decided before any hooks run — HAS_WEBVIEW is a module constant.
  if (!HAS_WEBVIEW) {
    return <BrowserFallback url={publicUrl} title={title} />;
  }
  return (
    <WebViewGuard url={publicUrl} title={title}>
      <NativeProfileWebView {...props} />
    </WebViewGuard>
  );
}

function NativeProfileWebView({
  username,
  title,
}: {
  username: string;
  title?: string;
}) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ref = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const origin = API_BASE_URL.replace(/\/$/, '');
  const startUrl = `${origin}/${encodeURIComponent(username)}?app=1`;
  const publicUrl = `${origin}/${encodeURIComponent(username)}`;
  const profilePath = `/${username}`.toLowerCase();

  function allowNavigation(req: { url: string }): boolean {
    const url = req.url;
    if (url === startUrl || url === `${origin}${profilePath}` || url === `${origin}${profilePath}/`) {
      return true;
    }
    if (url.startsWith('about:') || url.startsWith('data:')) return true;
    if (url.startsWith(`${origin}${profilePath}/media-kit`)) return true;
    void Linking.openURL(url).catch(() => {});
    return false;
  }

  async function share() {
    try {
      await Share.share({ url: publicUrl, message: publicUrl });
    } catch {
      /* dismissed */
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
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
        <WebViewComponent
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
          style={{ flex: 1, backgroundColor: t.color.surface }}
        />

        {loading && !failed ? (
          <View style={[ABSOLUTE_FILL, styles(t).center]}>
            <ActivityIndicator color={t.color.brand} />
          </View>
        ) : null}

        {failed ? (
          <View style={[ABSOLUTE_FILL, styles(t).center, { padding: t.spacing.xl, gap: t.spacing.sm }]}>
            <Txt variant="bodyStrong">Couldn&apos;t load this profile</Txt>
            <Txt variant="footnote" tone="muted" center>
              Check your connection and try again.
            </Txt>
            <PressableScale
              onPress={() => {
                setFailed(false);
                ref.current?.reload?.();
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

/** Shown when the binary has no WebView module — opens the profile in Safari/Chrome. */
function BrowserFallback({ url, title }: { url: string; title: string }) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (opened) return;
    setOpened(true);
    void WebBrowser.openBrowserAsync(url).catch(() => {});
  }, [opened, url]);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <Card style={{ gap: 8 }}>
          <Txt variant="title3">{title}</Txt>
          <Txt variant="footnote" tone="muted">
            Opening this profile in your browser. Update the app for the in-app view.
          </Txt>
          <Button label="Open again" size="md" onPress={() => WebBrowser.openBrowserAsync(url)} />
          <Button label="Back" size="md" variant="secondary" onPress={() => router.back()} />
        </Card>
      </View>
    </Screen>
  );
}

const ABSOLUTE_FILL = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

const styles = (t: ReturnType<typeof useTheme>) => ({
  center: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.color.surface,
  },
});
