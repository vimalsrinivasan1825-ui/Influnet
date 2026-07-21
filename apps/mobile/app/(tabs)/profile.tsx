import { Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import {
  BadgeCheck,
  History,
  LogOut,
  Settings,
  Share2,
  Users,
} from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { API_BASE_URL } from '@/lib/supabase';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ChipWrap,
  Chip,
  ListGroup,
  ListRow,
  Screen,
  ScreenScroll,
  SectionLabel,
  Txt,
  VerifiedBadge,
} from '@/components/ui';
import { AppHeader } from '@/components/app-header';
import { Logo } from '@/components/brand/logo';

export default function ProfileScreen() {
  const t = useTheme();
  const router = useRouter();
  const { profile, signOut } = useSession();

  const isCreator = profile?.role === 'influencer';
  const displayName = isCreator ? profile?.name : (profile?.company_name ?? profile?.name);
  const avatar = isCreator ? profile?.avatar_url : profile?.logo_url;

  // The web page stays the shareable artifact — the app just hands out its URL.
  const publicUrl = profile?.username
    ? `${API_BASE_URL}/${isCreator ? 'c' : 'b'}/${profile.username}`
    : null;

  async function share() {
    if (!publicUrl) return;
    await Share.share({
      message: `${displayName} on Influnet — ${publicUrl}`,
      url: publicUrl,
    });
  }

  return (
    <Screen padded={false}>
      <AppHeader title="Profile" showBell={false} />

      <ScreenScroll>
        <Card raised style={{ gap: t.spacing.md, alignItems: 'center' }}>
          <Avatar uri={avatar} name={displayName} size={76} />

          <View style={{ alignItems: 'center', gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Txt variant="title2">{displayName ?? 'Your profile'}</Txt>
              {profile?.verified_badge || profile?.is_verified ? <VerifiedBadge size={17} /> : null}
            </View>
            {profile?.username ? (
              <Txt variant="callout" tone="muted">
                @{profile.username}
              </Txt>
            ) : null}
            {profile?.location ? (
              <Txt variant="footnote" tone="muted">
                {profile.location}
              </Txt>
            ) : null}
          </View>

          {profile?.headline || profile?.tagline ? (
            <Txt variant="callout" tone="soft" center>
              {profile.headline ?? profile.tagline}
            </Txt>
          ) : null}

          {isCreator && profile?.niche?.length ? (
            <ChipWrap>
              {profile.niche.slice(0, 4).map((n) => (
                <Chip key={n} label={n} />
              ))}
            </ChipWrap>
          ) : null}

          {publicUrl ? (
            <Button
              label="Share your profile"
              variant="secondary"
              size="md"
              onPress={share}
              icon={<Share2 size={16} color={t.color.content} />}
            />
          ) : null}
        </Card>

        {isCreator && !(profile?.verified_badge || profile?.is_verified) ? (
          <Card style={{ gap: t.spacing.sm, borderColor: t.color.brand + '40' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
              <BadgeCheck size={18} color={t.color.brand} />
              <Txt variant="bodyStrong" style={{ flex: 1 }}>
                Get verified
              </Txt>
              <Badge label="Recommended" tone="brand" />
            </View>
            <Txt variant="footnote" tone="muted">
              Prove you own your Instagram account. Verified creators get more
              requests and better rates.
            </Txt>
            <Button
              label="Start verification"
              size="md"
              onPress={() => router.push('/verification')}
            />
          </Card>
        ) : null}

        <SectionLabel>Manage</SectionLabel>
        <ListGroup>
          <ListRow
            title="Connections"
            subtitle="Everyone you've worked with"
            left={<Users size={19} color={t.color.contentSoft} />}
            onPress={() => router.push('/connections')}
          />
          <ListRow
            title="My activity"
            subtitle="Everything that's happened on your account"
            left={<History size={19} color={t.color.contentSoft} />}
            style={{ borderTopWidth: 1, borderTopColor: t.color.hairline }}
            onPress={() => router.push('/activity')}
          />
          <ListRow
            title="Settings"
            subtitle="Account, notifications, blocked users"
            left={<Settings size={19} color={t.color.contentSoft} />}
            style={{ borderTopWidth: 1, borderTopColor: t.color.hairline }}
            onPress={() => router.push('/settings')}
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

        {/* Signs off the screen the way an About panel would — and gives the
            mark a home on the one tab that is entirely about you. */}
        <View style={{ alignItems: 'center', gap: t.spacing.xs, paddingTop: t.spacing.lg }}>
          <Logo size={26} />
          <Txt variant="caption" tone="muted">
            Influnet {Constants.expoConfig?.version ?? ''}
          </Txt>
        </View>
      </ScreenScroll>
    </Screen>
  );
}
