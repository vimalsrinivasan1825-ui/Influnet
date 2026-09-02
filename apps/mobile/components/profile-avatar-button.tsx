/**
 * The signed-in person's avatar, top-right on every tab root.
 *
 * Replaces the old Profile tab: a tap goes to /profile, a long-press opens the
 * account switcher (the gesture that used to live on the Profile tab button).
 * The switcher sheet itself is mounted once in app/(tabs)/_layout.tsx and
 * summoned through useAccountSheet, so this works from any tab.
 */
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSession } from '@/lib/session';
import { useAccountSheet } from '@/lib/use-account-sheet';
import { Avatar } from '@/components/ui';

export function ProfileAvatarButton({ size = 38 }: { size?: number }) {
  const router = useRouter();
  const profile = useSession((s) => s.profile);
  const uri = profile?.role === 'influencer' ? profile?.avatar_url : profile?.logo_url;

  return (
    <Pressable
      onPress={() => router.push('/profile')}
      onLongPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        useAccountSheet.getState().open();
      }}
      delayLongPress={300}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Your profile. Long-press to switch account."
    >
      <Avatar uri={uri} name={profile?.name ?? null} size={size} />
    </Pressable>
  );
}
