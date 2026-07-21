import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { Button, Card, Field, ScreenScroll, StickyFooter, Txt } from '@/components/ui';

export default function NewRequest() {
  const t = useTheme();
  const router = useRouter();
  const { to, name } = useLocalSearchParams<{ to: string; name?: string }>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const budgetValue = Number(budget.replace(/[^0-9]/g, ''));
  const canSend = title.trim().length > 2 && description.trim().length > 9 && !busy;

  async function send() {
    setBusy(true);
    setError(null);

    const res = await endpoints.createCollab({
      to_user_id: to,
      project_title: title.trim(),
      project_description: description.trim(),
      budget: budgetValue > 0 ? budgetValue : undefined,
    });

    setBusy(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.replace('/requests');
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.color.surface }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScreenScroll contentContainerStyle={{ paddingTop: t.spacing.lg, gap: t.spacing.lg }}>
        {name ? (
          <Txt variant="callout" tone="muted">
            To {name}
          </Txt>
        ) : null}

        <Field
          label="What's the campaign?"
          value={title}
          onChangeText={setTitle}
          placeholder="Diwali reel series"
          autoFocus
        />

        <Field
          label="What do you need from them?"
          value={description}
          onChangeText={setDescription}
          placeholder="Two 30-second reels featuring our new range, shot at home, delivered by the 20th."
          multiline
          hint="Be specific about deliverables and timing — it speeds up the reply."
        />

        <Field
          label="Budget (optional)"
          value={budget}
          onChangeText={setBudget}
          placeholder="15000"
          keyboardType="number-pad"
          hint={budgetValue > 0 ? `₹${budgetValue.toLocaleString('en-IN')}` : 'You can agree this in chat instead.'}
        />

        {error ? (
          <Card style={{ backgroundColor: t.color.dangerSoft, borderColor: t.color.danger }}>
            <Txt variant="footnote" tone="danger">
              {error}
            </Txt>
          </Card>
        ) : null}
      </ScreenScroll>

      <StickyFooter>
        <Button label="Send request" onPress={send} disabled={!canSend} loading={busy} />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}
