import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BUDGET_RANGES,
  BUSINESS_TYPES,
  COLLAB_TYPES,
  INDIAN_STATES,
  INDUSTRIES,
} from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { completeSignup } from '@/lib/use-signup';
import { WizardStep } from '@/components/wizard';
import { Chip, ChipWrap, Field, Txt } from '@/components/ui';

const TOTAL = 5;

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function BusinessSignup() {
  const t = useTheme();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [industry, setIndustry] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [budget, setBudget] = useState('');
  const [collabPreferences, setCollabPreferences] = useState<string[]>([]);
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  async function submit() {
    setBusy(true);
    setError(null);

    const result = await completeSignup(email, password, {
      role: 'business_owner',
      name: name.trim(),
      companyName: company.trim(),
      industry,
      businessType: businessType || undefined,
      marketingBudget: budget || undefined,
      collabPreferences,
      website: website.trim() || undefined,
      city: city.trim() || undefined,
      state: state || undefined,
      location: [city.trim(), state].filter(Boolean).join(', ') || undefined,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? 'Could not create your account.');
      return;
    }
    if (result.needsConfirmation) {
      setError('Check your email to confirm your address, then sign in.');
      return;
    }
    // New businesses land on the review screen, not the tabs.
    router.replace('/');
  }

  const next = () => (step === TOTAL - 1 ? void submit() : setStep((s) => s + 1));

  const steps = [
    {
      title: 'Tell us about your business',
      valid: name.trim().length > 1 && company.trim().length > 1,
      body: (
        <View style={{ gap: t.spacing.lg }}>
          <Field
            label="Your name"
            value={name}
            onChangeText={setName}
            placeholder="Arjun Mehta"
            autoComplete="name"
            autoFocus
          />
          <Field
            label="Company name"
            value={company}
            onChangeText={setCompany}
            placeholder="Kadai Foods"
          />
        </View>
      ),
    },
    {
      title: 'Create your login',
      valid: /\S+@\S+\.\S+/.test(email) && password.length >= 8,
      body: (
        <View style={{ gap: t.spacing.lg }}>
          <Field
            label="Work email"
            value={email}
            onChangeText={setEmail}
            // See the note on the sign-in email field: keyboardType
            // "email-address" is what broke caret placement on Android.
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@company.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            hint="At least 8 characters."
            placeholder="Create a password"
          />
        </View>
      ),
    },
    {
      title: 'What industry are you in?',
      valid: !!industry,
      body: (
        <View style={{ gap: t.spacing.xl }}>
          <ChipWrap>
            {INDUSTRIES.map((i) => (
              <Chip key={i} label={i} selected={industry === i} onPress={() => setIndustry(i)} />
            ))}
          </ChipWrap>

          <View style={{ gap: t.spacing.sm }}>
            <Txt variant="footnote" tone="soft">
              Business type
            </Txt>
            <ChipWrap>
              {BUSINESS_TYPES.map((b) => (
                <Chip
                  key={b}
                  label={b}
                  selected={businessType === b}
                  onPress={() => setBusinessType(b)}
                />
              ))}
            </ChipWrap>
          </View>
        </View>
      ),
    },
    {
      title: 'How do you want to collaborate?',
      subtitle: 'This shapes the creators we surface for you.',
      valid: !!budget && collabPreferences.length > 0,
      body: (
        <View style={{ gap: t.spacing.xl }}>
          <View style={{ gap: t.spacing.sm }}>
            <Txt variant="footnote" tone="soft">
              Monthly marketing budget
            </Txt>
            <ChipWrap>
              {BUDGET_RANGES.map((b) => (
                <Chip key={b} label={b} selected={budget === b} onPress={() => setBudget(b)} />
              ))}
            </ChipWrap>
          </View>

          <View style={{ gap: t.spacing.sm }}>
            <Txt variant="footnote" tone="soft">
              Content formats you need
            </Txt>
            <ChipWrap>
              {COLLAB_TYPES.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  selected={collabPreferences.includes(c)}
                  onPress={() => setCollabPreferences((p) => toggle(p, c))}
                />
              ))}
            </ChipWrap>
          </View>
        </View>
      ),
    },
    {
      title: 'Where are you based?',
      subtitle: 'Your account goes to our team for a quick review after this.',
      valid: !!state,
      body: (
        <View style={{ gap: t.spacing.xl }}>
          <Field
            label="Website"
            value={website}
            onChangeText={setWebsite}
            placeholder="kadaifoods.com"
            autoCapitalize="none"
            keyboardType="url"
          />
          <Field label="City" value={city} onChangeText={setCity} placeholder="Chennai" />

          <View style={{ gap: t.spacing.sm }}>
            <Txt variant="footnote" tone="soft">
              State
            </Txt>
            <ChipWrap>
              {INDIAN_STATES.map((s) => (
                <Chip key={s} label={s} selected={state === s} onPress={() => setState(s)} />
              ))}
            </ChipWrap>
          </View>
        </View>
      ),
    },
  ];

  const current = steps[step];

  return (
    <WizardStep
      step={step}
      total={TOTAL}
      title={current.title}
      subtitle={current.subtitle}
      onNext={next}
      nextLabel={step === TOTAL - 1 ? 'Create account' : 'Continue'}
      nextDisabled={!current.valid || busy}
      busy={busy}
      error={error}
    >
      {current.body}
    </WizardStep>
  );
}
