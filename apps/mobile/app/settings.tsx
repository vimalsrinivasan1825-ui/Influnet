import { useRef } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { LogOut, Mail, ShieldOff, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { API_BASE_URL } from '@/lib/supabase';
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

export default function SettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { profile, signOut } = useSession();
  const deleteSheet = useRef<SheetRef>(null);

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
        onPress={async () => {
          await signOut();
          router.replace('/welcome');
        }}
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
