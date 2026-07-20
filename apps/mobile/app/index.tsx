/**
 * Entry gate. Holds a spinner until the stored session has been read, then
 * routes once — signed out to the welcome screen, signed in to the tabs, and
 * business owners still awaiting admin approval to the review screen.
 */
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { palette } from '@influnet/tokens';
import { useSession } from '@/lib/session';

export default function Index() {
  const { session, profile, ready, loadingProfile } = useSession();

  if (!ready || (session && !profile && loadingProfile)) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.surface,
        }}
      >
        <ActivityIndicator color={palette.contentMuted} />
      </View>
    );
  }

  if (!session) return <Redirect href="/welcome" />;

  if (profile?.role === 'business_owner' && profile.approval_status === 'pending_review') {
    return <Redirect href="/pending" />;
  }

  return <Redirect href="/home" />;
}
