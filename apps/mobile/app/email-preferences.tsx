/**
 * Email preferences — the mobile twin of the web panel
 * (apps/web/src/components/dashboard/email-preferences-panel.tsx), same five
 * categories and the same words, over the same endpoint.
 *
 * The unsubscribe link in every activity email lands on the WEB version of this
 * screen; without this one, someone who only uses the app had nowhere to manage
 * their email. Account and security mail is deliberately absent: it cannot be
 * switched off, and a disabled toggle for it just invites a support ticket.
 */
import { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { Briefcase, CreditCard, Mail, MessageSquare, Megaphone, Send } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { ListGroup, ListRow, ScreenScroll, SectionLabel, SkeletonCard, Txt } from '@/components/ui';

type Category = 'collab' | 'project' | 'payment' | 'message' | 'marketing';
type Prefs = Record<Category, boolean>;

/** Same as the server's DEFAULTS: an absent row means these. Marketing is opt-in. */
const DEFAULTS: Prefs = { collab: true, project: true, payment: true, message: true, marketing: false };

const ROWS: Array<{ key: Category; title: string; subtitle: string; icon: typeof Mail }> = [
  {
    key: 'collab',
    title: 'Collaboration requests',
    subtitle: 'Someone wants to work with you, accepted your request, or a request is about to expire.',
    icon: Send,
  },
  {
    key: 'project',
    title: 'Project updates',
    subtitle: "A stage moved, it's your turn to act, or a project completed.",
    icon: Briefcase,
  },
  { key: 'payment', title: 'Payments', subtitle: 'A payment cleared or failed on one of your projects.', icon: CreditCard },
  {
    key: 'message',
    title: 'Messages',
    subtitle: 'Unread chat messages. Rolled up — at most one per conversation per hour.',
    icon: MessageSquare,
  },
  { key: 'marketing', title: 'Product updates', subtitle: 'New features and tips. Off unless you turn it on.', icon: Megaphone },
];

export default function EmailPreferencesScreen() {
  const t = useTheme();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState<Category | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await endpoints.emailPreferences<{ preferences: Prefs }>();
      if (res.ok && res.data?.preferences) setPrefs({ ...DEFAULTS, ...res.data.preferences });
      else setFailed(true);
    })();
  }, []);

  async function toggle(key: Category, next: boolean) {
    if (!prefs) return;
    const previous = prefs;
    // Optimistic: a toggle that waits for a round trip feels broken.
    setPrefs({ ...prefs, [key]: next });
    setSaving(key);
    const res = await endpoints.setEmailPreferences<{ preferences: Prefs }>({ [key]: next });
    setSaving(null);
    if (!res.ok) {
      setPrefs(previous);
      Alert.alert('Could not save', res.error ?? 'Please try again.');
    }
  }

  return (
    <ScreenScroll>
      <Txt variant="footnote" tone="muted">
        Choose which emails you get. Sign-in codes, security notices and receipts always come through.
      </Txt>

      {failed ? (
        <Txt variant="footnote" style={{ color: t.color.danger }}>
          We could not load your email settings. Check your connection and reopen this screen.
        </Txt>
      ) : !prefs ? (
        <SkeletonCard />
      ) : (
        <>
          <SectionLabel>Email me about</SectionLabel>
          <ListGroup>
            {ROWS.map((row) => (
              <ListRow
                key={row.key}
                title={row.title}
                subtitle={row.subtitle}
                left={<row.icon size={19} color={t.color.contentSoft} />}
                right={
                  <View>
                    <Switch
                      value={prefs[row.key]}
                      disabled={saving === row.key}
                      onValueChange={(on) => void toggle(row.key, on)}
                      trackColor={{ true: t.color.brand, false: t.color.hairlineStrong }}
                      thumbColor={t.color.white}
                      style={{ transform: [{ scale: 0.85 }] }}
                      accessibilityLabel={row.title}
                    />
                  </View>
                }
              />
            ))}
          </ListGroup>
        </>
      )}
    </ScreenScroll>
  );
}
