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

  // No approval gate here any more. Sending a collab request stopped being
  // blocked on admin approval on 2026-07-30 — the creator sees the sender's
  // approval status on the incoming request instead — and web gives an
  // unapproved business the whole dashboard behind a dismissible banner. This
  // redirect meant the same account was a full product on the desktop and a
  // locked door on the phone.
  //
  // It was wrong the other way too: it only caught `pending_review`, so a
  // REJECTED business (a real negative decision, and the one the server still
  // refuses outreach for) fell through to the tabs with no warning at all.
  //
  // Both states now surface as <ApprovalBanner /> in the tab shell, matching web.
  return <Redirect href="/home" />;
}
