/**
 * One social handle field: brand mark, input, and an explicit Connect button.
 *
 * The web signup has the same component (apps/web/src/components/signup/
 * social-connect-field.tsx) — same rules, same copy, so a creator who starts on
 * the phone and finishes on the laptop sees one product.
 *
 * Connect is a button rather than a debounce because the lookup behind it is a
 * billed provider call, and a phone keyboard produces far more mid-word pauses
 * than a laptop one. See lib/use-social-connect.ts.
 */
import { View } from 'react-native';
import { ActivityIndicator } from 'react-native';
import { AlertCircle, Check, Lock, RefreshCw, Search } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Avatar, Button, Field, Txt, VerifiedBadge } from '@/components/ui';
import { SOCIAL_ICONS, type SocialIconName } from '@/components/social-icons';
import type { SocialConnectResult } from '@/lib/use-social-connect';

const PLATFORM_LABEL: Record<SocialIconName, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  twitter: 'X (Twitter)',
  facebook: 'Facebook',
  snapchat: 'Snapchat',
};

export interface SocialConnectFieldProps {
  platform: SocialIconName;
  value: string;
  onChangeText: (value: string) => void;
  connect: SocialConnectResult;
  label?: string;
  placeholder?: string;
  hint?: string | null;
  /** Blocking message from a separate check (e.g. handle already claimed here). */
  error?: string | null;
  /** Link-only platforms (Snapchat) render without a Connect button. */
  linkOnly?: boolean;
}

export function SocialConnectField({
  platform,
  value,
  onChangeText,
  connect,
  label,
  placeholder,
  hint,
  error,
  linkOnly,
}: SocialConnectFieldProps) {
  const t = useTheme();
  const Icon = SOCIAL_ICONS[platform];
  const clean = value.replace(/^@/, '').trim();
  const { status, profile, message } = connect;

  const busy = status === 'checking';
  const connected = status === 'connected';
  const failed = status === 'private' || status === 'notfound' || status === 'invalid';

  return (
    <View style={{ gap: t.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field
            label={label ?? PLATFORM_LABEL[platform]}
            value={value}
            onChangeText={(v) => onChangeText(v.replace(/^@/, ''))}
            placeholder={placeholder ?? '@yourhandle'}
            autoCapitalize="none"
            autoCorrect={false}
            left={<Icon size={18} />}
            error={error ?? (failed ? statusLine(status, platform) : null)}
            hint={error ? null : hint}
            // Enter finishes the field AND runs the lookup — the button is a
            // shortcut, not the only way through.
            returnKeyType={linkOnly ? 'done' : 'search'}
            onSubmitEditing={() => {
              if (!linkOnly && clean && !busy) connect.connect();
            }}
          />
        </View>
        {!linkOnly && (
          <Button
            label={connected ? 'Recheck' : 'Connect'}
            variant={connected ? 'secondary' : 'primary'}
            size="md"
            inline
            loading={busy}
            disabled={!clean || busy}
            icon={connected ? <RefreshCw size={15} color={t.color.content} /> : <Search size={15} color={t.color.white} />}
            onPress={connect.connect}
            // Nudges the button off the label row so it lines up with the input
            // itself rather than floating above it.
            style={{ marginBottom: hint || error ? 22 : 2 }}
          />
        )}
      </View>

      {/* Result card. Rendered only when there is something real to say —
          'idle' and 'error' stay silent, because a provider hiccup is not the
          user's problem and must never read as "your handle is wrong". */}
      {busy && (
        <Shell tone="neutral">
          <ActivityIndicator size="small" color={t.color.contentMuted} />
          <Txt variant="footnote" tone="muted">
            Looking up @{clean} on {PLATFORM_LABEL[platform]}…
          </Txt>
        </Shell>
      )}

      {status === 'notfound' && (
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
      )}

      {status === 'private' && (
        <Shell tone="danger">
          <Lock size={20} color={t.color.danger} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="footnote" tone="danger">
              @{clean} is private
            </Txt>
            <Txt variant="footnote" tone="muted">
              We can&apos;t read follower numbers or verify ownership on a private account.
              Switch it to public, or use a different handle, to continue.
            </Txt>
          </View>
        </Shell>
      )}

      {status === 'error' && (
        <Shell tone="neutral">
          <AlertCircle size={20} color={t.color.contentMuted} />
          <Txt variant="footnote" tone="muted" style={{ flex: 1 }}>
            {message ?? `Couldn't reach ${PLATFORM_LABEL[platform]} just now — tap Connect to try again.`}
          </Txt>
        </Shell>
      )}

      {connected && (
        <Shell tone="ok">
          <Avatar uri={profile?.avatarUrl} name={profile?.displayName ?? clean} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>
                {profile?.displayName || `@${clean}`}
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
              Not your account? Fix the handle and tap Connect again.
            </Txt>
          </View>
          <Check size={19} color={t.color.ok} />
        </Shell>
      )}
    </View>
  );
}

function statusLine(status: string, platform: SocialIconName): string | null {
  if (status === 'invalid') return `That doesn't look like a ${PLATFORM_LABEL[platform]} username`;
  return null;
}

function Shell({ tone, children }: { tone: 'neutral' | 'danger' | 'ok'; children: React.ReactNode }) {
  const t = useTheme();
  const border = tone === 'danger' ? t.color.danger : tone === 'ok' ? t.color.ok : t.color.hairlineStrong;
  const bg = tone === 'danger' ? t.color.dangerSoft : tone === 'ok' ? t.color.okSoft : t.color.surfaceCard;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        padding: t.spacing.md,
        borderRadius: t.radii.md,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: bg,
      }}
    >
      {children}
    </View>
  );
}
