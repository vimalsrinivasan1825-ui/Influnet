/**
 * The business-approval banner, mirroring the web dashboard shell.
 *
 * Mobile used to hard-redirect an unapproved business to a dead-end /pending
 * screen, which put the two clients in flat contradiction: the SAME account had
 * a full dashboard on web (and could message creators — sending stopped being
 * gated on approval on 2026-07-30) and no app at all on the phone.
 *
 * It was also wrong in the other direction. The redirect only fired on
 * `pending_review`, so a business an admin had actively REJECTED fell straight
 * through to the tabs with no warning anywhere — while web showed it a banner
 * and the server refused its outreach. The two states were, in effect, swapped.
 *
 * So: no gate, a banner. Same two states, same copy, same dismiss-per-status
 * behaviour as web — a later status change surfaces a fresh banner rather than
 * inheriting the old dismissal.
 */
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Clock, X, XCircle } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { Txt } from '@/components/ui';

const STORAGE_PREFIX = 'influnet_verif_banner:';

export function ApprovalBanner() {
  const t = useTheme();
  const role = useSession((s) => s.profile?.role);
  const approvalStatus = useSession((s) => s.profile?.approval_status);

  // `undefined` means "not resolved yet" — distinct from "not dismissed".
  // Rendering before the stored value is read makes a dismissed banner flash
  // back on every cold start.
  const [dismissed, setDismissed] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!approvalStatus) return;
    let cancelled = false;
    AsyncStorage.getItem(`${STORAGE_PREFIX}${approvalStatus}`)
      .then((v) => {
        if (!cancelled) setDismissed(v === '1');
      })
      .catch(() => {
        if (!cancelled) setDismissed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [approvalStatus]);

  const show =
    role === 'business_owner' &&
    (approvalStatus === 'pending_review' || approvalStatus === 'rejected') &&
    dismissed === false;

  if (!show) return null;

  const isRejected = approvalStatus === 'rejected';

  async function dismiss() {
    setDismissed(true);
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${approvalStatus}`, '1').catch(() => {});
  }

  return (
    <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: t.spacing.sm,
          borderRadius: t.radii.lg,
          borderWidth: 1,
          borderColor: isRejected ? t.color.danger : t.color.warn,
          backgroundColor: isRejected ? t.color.dangerSoft : t.color.warnSoft,
          paddingHorizontal: t.spacing.md,
          paddingVertical: t.spacing.md,
        }}
      >
        <View style={{ marginTop: 1 }}>
          {isRejected ? (
            <XCircle size={20} color={t.color.danger} />
          ) : (
            <Clock size={20} color={t.color.warn} />
          )}
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong">
            {isRejected ? 'Your account wasn’t approved' : 'Your profile is being verified'}
          </Txt>
          <Txt variant="footnote" tone="soft">
            {isRejected
              ? 'Our review team didn’t approve your business account. You can look around, but reaching out to creators is disabled. Think this is a mistake? Contact support and we’ll take another look.'
              : 'You can reach out to creators right away — creators will see your account is still being reviewed by our team until it’s approved, usually within 1–2 business days.'}
          </Txt>
        </View>

        <Pressable
          onPress={dismiss}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          // Comfortably past the 44pt minimum without the icon itself growing.
          hitSlop={12}
        >
          <X size={16} color={t.color.contentMuted} />
        </Pressable>
      </View>
    </View>
  );
}
