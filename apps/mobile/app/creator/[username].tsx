/**
 * A creator's public profile, embedded — never a system browser hand-off.
 *
 * Renders the real web page (apps/web/src/app/c/[username]/page.tsx) inside
 * our own screen via react-native-webview, so it's always pixel-identical to
 * what a brand sees on web with zero native re-implementation to keep in
 * sync — but it stays inside the app's own navigation stack the whole time:
 * our header, our back button, nothing hands off to Safari/Chrome.
 */
import { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { useTheme } from '@/lib/theme';
import { API_BASE_URL } from '@/lib/supabase';
import { ErrorState } from '@/components/ui';

export default function CreatorDetail() {
  const t = useTheme();
  const { username } = useLocalSearchParams<{ username: string }>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const url = `${API_BASE_URL}/c/${encodeURIComponent(username)}`;

  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      {failed ? (
        <ErrorState
          message="This profile didn't load."
          onRetry={() => {
            setFailed(false);
            setLoading(true);
          }}
        />
      ) : (
        <>
          <WebView
            key={url}
            source={{ uri: url }}
            style={{ flex: 1, backgroundColor: t.color.surface }}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
            onHttpError={(e) => {
              if (e.nativeEvent.statusCode >= 400) {
                setLoading(false);
                setFailed(true);
              }
            }}
            // The page's own topbar already has a "back to influnet.app" link
            // and a copy-link action — nothing here needs to escape the view.
            setSupportMultipleWindows={false}
            originWhitelist={['*']}
          />
          {loading ? (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: t.color.surface,
              }}
            >
              <ActivityIndicator color={t.color.brand} />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
