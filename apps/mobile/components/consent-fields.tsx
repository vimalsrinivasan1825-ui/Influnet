/**
 * The two boxes every signup must tick: accept the Terms + Privacy Policy, and
 * confirm being 18 or older. Both signup wizards render this on their LAST step
 * and block "Create account" until `consentComplete()`.
 *
 * Only the visible half: the server (POST /api/auth/register) refuses a signup
 * without both, so a client that skips this still cannot open an account. The
 * web wizards have the same fields (apps/web/src/components/signup/
 * consent-fields.tsx) — same rules, same words.
 */
import { Pressable, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Check } from 'lucide-react-native';
import { TERMS_VERSION } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { API_BASE_URL } from '@/lib/supabase';
import { Txt } from '@/components/ui';

export interface ConsentState {
  terms: boolean;
  age: boolean;
}

export const NO_CONSENT: ConsentState = { terms: false, age: false };

export const consentComplete = (c: ConsentState): boolean => c.terms && c.age;

/** The fields the register payload carries; the server records the time. */
export const consentPayload = (c: ConsentState) => ({
  termsAccepted: c.terms,
  ageConfirmed: c.age,
  termsVersion: TERMS_VERSION,
});

function Box({
  checked,
  onToggle,
  children,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  label: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.md }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: checked ? t.color.brand : t.color.hairlineStrong,
          backgroundColor: checked ? t.color.brand : t.color.surfaceCard,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {checked && <Check size={16} color={t.color.white} strokeWidth={3} />}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

export function ConsentFields({
  value,
  onChange,
}: {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
}) {
  const t = useTheme();
  const open = (slug: 'terms' | 'privacy') => void WebBrowser.openBrowserAsync(`${API_BASE_URL}/legal/${slug}`);
  const link = { color: t.color.brand, fontWeight: '700' as const };
  return (
    <View style={{ gap: t.spacing.lg }}>
      <Box
        checked={value.terms}
        onToggle={() => onChange({ ...value, terms: !value.terms })}
        label="I agree to the Terms of Service and the Privacy Policy"
      >
        <Txt variant="footnote" tone="soft">
          I agree to the{' '}
          <Txt variant="footnote" style={link} onPress={() => open('terms')} accessibilityRole="link">
            Terms of Service
          </Txt>{' '}
          and the{' '}
          <Txt variant="footnote" style={link} onPress={() => open('privacy')} accessibilityRole="link">
            Privacy Policy
          </Txt>
          .
        </Txt>
      </Box>
      <Box
        checked={value.age}
        onToggle={() => onChange({ ...value, age: !value.age })}
        label="I am 18 years of age or older"
      >
        <Txt variant="footnote" tone="soft">
          I am 18 years of age or older.
        </Txt>
      </Box>
    </View>
  );
}
