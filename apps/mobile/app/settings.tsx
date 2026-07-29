import { useRef, useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Bell, LogOut, Mail, ShieldOff, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
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
  const { profile } = useSession();
  const { signOut, signingOut } = useSignOutAction();
  const deleteSheet = useRef<SheetRef>(null);
  const [testingPush, setTestingPush] = useState(false);

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

      <Sheet ref={deleteSheet} title="Delete your account?">
        <Txt variant="body" tone="soft">
          This removes your profile, your projects and your messages. Active
          projects with money still in flight have to be settled first.
        </Txt>
        <Txt variant="footnote" tone="muted">
          Deletion is handled by our team so we can check nothing is left open.
          Email us and we'll confirm within two working days.
        </Txt>
        <Button
          label="Email support"
          icon={<Mail size={16} color={t.color.white} />}
          onPress={() => {
            void Linking.openURL(
              `mailto:support@influnet.in?subject=Delete my account&body=Please delete the account for ${profile?.email ?? ''}.`
            );
            deleteSheet.current?.close();
          }}
        />
      </Sheet>
    </ScreenScroll>
  );
}
