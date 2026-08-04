/**
 * The "is this you?" card under the Instagram field at signup.
 *
 * Renders whatever useInstagramPreview() found: the real account (photo, name,
 * follower count) so a mistyped handle is visibly someone else, or a plain
 * explanation when the account is private / missing. Deliberately quiet on
 * `error` — a provider hiccup is not the user's problem and must not read as
 * "your handle is wrong".
 */
import { View } from 'react-native';
import { ActivityIndicator } from 'react-native';
import { Lock, Search } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Avatar, Txt, VerifiedBadge } from '@/components/ui';
import type { InstagramPreview, InstagramPreviewStatus } from '@/lib/use-instagram-preview';

function Shell({ tone, children }: { tone: 'neutral' | 'danger'; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        padding: t.spacing.md,
        borderRadius: t.radii.md,
        borderWidth: 1,
        borderColor: tone === 'danger' ? t.color.danger : t.color.hairlineStrong,
        backgroundColor: tone === 'danger' ? t.color.dangerSoft : t.color.surfaceCard,
      }}
    >
      {children}
    </View>
  );
}

export function InstagramPreviewCard({
  status,
  profile,
  handle,
}: {
  status: InstagramPreviewStatus;
  profile: InstagramPreview | null;
  handle: string;
}) {
  const t = useTheme();
  const clean = handle.replace(/^@/, '').trim();

  if (status === 'idle' || status === 'error') return null;

  if (status === 'checking') {
    return (
      <Shell tone="neutral">
        <ActivityIndicator size="small" color={t.color.contentMuted} />
        <Txt variant="footnote" tone="muted">
          Looking up @{clean} on Instagram…
        </Txt>
      </Shell>
    );
  }

  if (status === 'notfound') {
    return (
      <Shell tone="danger">
        <Search size={20} color={t.color.danger} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="footnote" tone="danger">
            No public account called @{clean}
          </Txt>
          <Txt variant="footnote" tone="muted">
            Check the spelling — this is the handle brands will see.
          </Txt>
        </View>
      </Shell>
    );
  }

  if (status === 'private') {
    return (
      <Shell tone="danger">
        <Lock size={20} color={t.color.danger} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="footnote" tone="danger">
            @{clean} is a private account
          </Txt>
          <Txt variant="footnote" tone="muted">
            We can't read follower numbers or verify ownership on a private
            account. Switch it to public, or use a different handle, to continue.
          </Txt>
        </View>
      </Shell>
    );
  }

  // found
  return (
    <Shell tone="neutral">
      <Avatar uri={profile?.profilePicUrl} name={profile?.fullName ?? clean} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {profile?.fullName || `@${clean}`}
          </Txt>
          {profile?.isVerified ? <VerifiedBadge size={14} /> : null}
        </View>
        <Txt variant="footnote" tone="muted" numberOfLines={1}>
          @{clean}
          {typeof profile?.followerCount === 'number'
            ? ` · ${profile.followerCount.toLocaleString('en-IN')} followers`
            : ''}
        </Txt>
        <Txt variant="footnote" tone="muted">
          Not your account? Check the spelling.
        </Txt>
      </View>
    </Shell>
  );
}
