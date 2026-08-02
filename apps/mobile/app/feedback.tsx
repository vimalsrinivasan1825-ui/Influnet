/**
 * Send feedback — the product signal channel, separate from support.
 *
 * Support is "I am stuck, help me"; feedback is "this is annoying / here is an
 * idea". Keeping them apart means a stuck user is never queued behind a
 * feature request.
 */
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { track } from '@/lib/analytics';
import { Button, Card, Chip, Field, ScreenScroll, Txt } from '@/components/ui';

const KINDS = [
  { value: 'idea', label: 'An idea' },
  { value: 'confusion', label: 'Confusing' },
  { value: 'bug', label: 'Broken' },
  { value: 'praise', label: 'Something good' },
];

export default function FeedbackScreen() {
  const t = useTheme();
  const router = useRouter();
  const [kind, setKind] = useState('idea');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setSending(true);
    setError(null);
    try {
      await endpoints.sendFeedback({ kind, message: message.trim(), surface: 'mobile' });
      track('feedback_submitted', { kind });
      setDone(true);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your feedback');
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <ScreenScroll>
        <Card style={styles.thanks}>
          <Txt variant="title3" center>
            Thank you
          </Txt>
          <Txt variant="body" tone="muted" center>
            This goes straight to the team. It genuinely shapes what we build next.
          </Txt>
          <Button label="Done" onPress={() => router.back()} />
        </Card>
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll>
      <Card style={styles.form}>
        <Txt variant="bodyStrong">What kind of feedback is it?</Txt>
        <View style={styles.chips}>
          {KINDS.map((k) => (
            <Chip
              key={k.value}
              label={k.label}
              selected={kind === k.value}
              onPress={() => setKind(k.value)}
            />
          ))}
        </View>

        <Field
          label="Tell us more"
          value={message}
          onChangeText={setMessage}
          placeholder="What's on your mind?"
          multiline
          numberOfLines={6}
        />

        {error ? (
          <Txt variant="footnote" tone="danger">
            {error}
          </Txt>
        ) : null}

        <Button
          label="Send feedback"
          onPress={submit}
          loading={sending}
          disabled={message.trim().length < 3}
        />
      </Card>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  thanks: { gap: 12, alignItems: 'stretch' },
});
