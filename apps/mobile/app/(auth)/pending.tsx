/**
 * Where a business owner waits for admin approval.
 *
 * On the web this is a dead end you have to keep re-checking. Here it's a
 * status screen the app can push to — so the loop closes on its own.
 */
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldCheck } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession, useSignOutAction } from '@/lib/session';
import { Button, Card, Screen, Txt } from '@/components/ui';

export default function PendingApproval() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, loadProfile, loadingProfile } = useSession();
  const { signOut, signingOut } = useSignOutAction();

  async function recheck() {
    await loadProfile();
    const status = useSession.getState().profile?.approval_status;
    if (status === 'approved') router.replace('/home');
  }

  const rejected = profile?.approval_status === 'rejected';

  return (
    <Screen style={{ paddingTop: insets.top + t.spacing['3xl'] }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: t.spacing.xl, paddingBottom: insets.bottom }}>
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: rejected ? t.color.dangerSoft : t.color.brandSoft,
          }}
        >
          <ShieldCheck size={28} color={rejected ? t.color.danger : t.color.brand} />
        </View>

        <View style={{ gap: t.spacing.sm }}>
          <Txt variant="title1">
            {rejected ? 'We could not approve this account' : 'Your account is under review'}
          </Txt>
          <Txt variant="body" tone="soft">
            {rejected
              ? 'Our team reviewed your business details and could not verify them. Reply to the email we sent and we will take another look.'
              : 'We check every business before it can contact creators. This usually takes a few hours — we will notify you the moment it clears.'}
          </Txt>
        </View>

        {!rejected ? (
          <Card style={{ gap: 6 }}>
            <Txt variant="footnote" tone="soft">
              Signed in as
            </Txt>
            <Txt variant="bodyStrong">{profile?.company_name ?? profile?.name ?? profile?.email}</Txt>
          </Card>
        ) : null}

        <View style={{ gap: t.spacing.sm }}>
          {!rejected ? (
            <Button label="Check again" onPress={recheck} loading={loadingProfile} />
          ) : null}
          <Button
            label="Sign out"
            variant="secondary"
            // Navigation, error handling and the busy state come from
            // useSignOutAction — see the hook.
            loading={signingOut}
            onPress={signOut}
          />
        </View>
      </View>
    </Screen>
  );
}
