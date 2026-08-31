/**
 * The account switcher — a bottom sheet listing every Influnet account signed
 * in on this device, plus "Add account".
 *
 * Mounted ONCE (in the tab layout) and driven by `useAccountSheet`, so it can
 * be opened from anywhere: the "Switch account" row in Profile, and a
 * long-press on the Profile tab.
 *
 * Adding a second account is a Pro feature (product decision 2026-08-31): a
 * Free user is sent to the paywall. Switching between accounts you already
 * have is free. Signing out of an account removes it from the device (see
 * lib/accounts.ts) — this sheet doesn't offer a per-row sign out; the Settings
 * "Sign out" button does that for the active account.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, Plus, Sparkles } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { useEntitlements } from '@/lib/use-entitlements';
import { useAccountSheet } from '@/lib/use-account-sheet';
import { listAccounts, type AccountSummary } from '@/lib/accounts';
import { Avatar, ListRow, Sheet, Txt, type SheetRef } from '@/components/ui';

export function AccountSwitcher() {
  const t = useTheme();
  const router = useRouter();
  const sheet = useRef<SheetRef>(null);
  const switchAccount = useSession((s) => s.switchAccount);
  const { isPro, enabled: billingEnabled } = useEntitlements();

  const visible = useAccountSheet((s) => s.visible);
  const close = useAccountSheet((s) => s.close);

  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { accounts: list, activeUserId } = await listAccounts();
    setAccounts(list);
    setActiveId(activeUserId);
  }, []);

  useEffect(() => {
    if (visible) {
      void load();
      sheet.current?.expand();
    } else {
      sheet.current?.close();
    }
  }, [visible, load]);

  async function pick(acct: AccountSummary) {
    if (acct.userId === activeId || busyId) return;
    setBusyId(acct.userId);
    const res = await switchAccount(acct.userId);
    setBusyId(null);
    if (!res.ok) {
      Alert.alert('Could not switch', res.error ?? 'Please sign in to that account again.');
      return;
    }
    close();
  }

  function addAccount() {
    close();
    // Gate is a product decision, not a server-enforced one — adding an account
    // is just signing in, which anyone can do. Free users get the paywall.
    if (billingEnabled && !isPro) {
      router.push('/billing' as any);
      Alert.alert(
        'Multiple accounts is a Pro feature',
        'Upgrade to add and switch between more than one Influnet account on this device.',
      );
      return;
    }
    router.push('/(auth)/login?add=1' as any);
  }

  return (
    <Sheet ref={sheet} title="Your accounts" onClose={close}>
      <View style={{ gap: 2, paddingBottom: t.spacing.md }}>
        {accounts.map((a) => (
          <ListRow
            key={a.userId}
            title={a.name ?? a.email}
            subtitle={a.name ? a.email : a.role ?? undefined}
            left={<Avatar name={a.name ?? a.email} uri={a.avatarUrl ?? undefined} size={36} />}
            right={
              busyId === a.userId ? (
                <ActivityIndicator size="small" color={t.color.brand} />
              ) : a.userId === activeId ? (
                <Check size={18} color={t.color.brand} />
              ) : undefined
            }
            onPress={() => pick(a)}
          />
        ))}

        <ListRow
          title="Add account"
          subtitle={
            billingEnabled && !isPro ? 'Pro — switch between multiple accounts' : 'Sign in to another account'
          }
          left={
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: t.color.surfaceMuted,
              }}
            >
              {billingEnabled && !isPro ? (
                <Sparkles size={17} color={t.color.contentSoft} />
              ) : (
                <Plus size={18} color={t.color.contentSoft} />
              )}
            </View>
          }
          style={{ borderTopWidth: 1, borderTopColor: t.color.hairline }}
          onPress={addAccount}
        />
      </View>
    </Sheet>
  );
}
