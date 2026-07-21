import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { COLLAB_TYPES, INDIAN_STATES, LANGUAGES, NICHES, PRICE_TIERS } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { completeSignup, useUsernameAvailability } from '@/lib/use-signup';
import { WizardStep } from '@/components/wizard';
import { Chip, ChipWrap, Field, Txt } from '@/components/ui';

const TOTAL = 6;

/** Toggle a value in a multi-select list. */
function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function CreatorSignup() {
  const t = useTheme();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [instagram, setInstagram] = useState('');
  const [niche, setNiche] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [collabTypes, setCollabTypes] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  const availability = useUsernameAvailability(username);

  async function submit() {
    setBusy(true);
    setError(null);

    const result = await completeSignup(email, password, {
      role: 'influencer',
      name: name.trim(),
      username: username.trim().toLowerCase(),
      instagramHandle: instagram.trim().replace(/^@/, ''),
      niche,
      languages,
      collabTypes,
      priceRange: priceRange || undefined,
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
    router.replace('/');
  }

  const next = () => (step === TOTAL - 1 ? void submit() : setStep((s) => s + 1));

  const steps = [
    {
      title: "What's your name?",
      subtitle: 'This is what brands see first.',
      valid: name.trim().length > 1,
      body: (
        <Field
          label="Full name"
          value={name}
          onChangeText={setName}
          placeholder="Priya Sharma"
          autoFocus
          autoComplete="name"
        />
      ),
    },
    {
      title: 'Claim your handle',
      subtitle: 'It becomes your public profile link.',
      valid: availability === 'available',
      body: (
        <Field
          label="Username"
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
          placeholder="priyasharma"
          autoCapitalize="none"
          autoCorrect={false}
          hint="Letters, numbers, dots and underscores. 3–30 characters."
          error={
            availability === 'taken'
              ? 'That handle is taken. Try another.'
              : availability === 'invalid' && username.length > 0
                ? 'Use 3–30 letters, numbers, dots or underscores.'
                : null
          }
          right={
            availability === 'checking' ? (
              <ActivityIndicator size="small" color={t.color.contentMuted} />
            ) : availability === 'available' ? (
              <Check size={19} color={t.color.ok} />
            ) : availability === 'taken' ? (
              <X size={19} color={t.color.danger} />
            ) : null
          }
        />
      ),
    },
    {
      title: 'Create your login',
      valid: /\S+@\S+\.\S+/.test(email) && password.length >= 8,
      body: (
        <View style={{ gap: t.spacing.lg }}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            // See the note on the sign-in email field: keyboardType
            // "email-address" is what broke caret placement on Android.
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
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
      title: 'Link your Instagram',
      subtitle: 'We pull your follower count and engagement so brands see real numbers.',
      valid: instagram.trim().length > 1,
      body: (
        <Field
          label="Instagram handle"
          value={instagram}
          onChangeText={setInstagram}
          placeholder="@yourhandle"
          autoCapitalize="none"
          autoCorrect={false}
        />
      ),
    },
    {
      title: 'What do you make?',
      subtitle: 'Pick the niches and formats you work in. Brands filter by these.',
      valid: niche.length > 0 && collabTypes.length > 0,
      body: (
        <View style={{ gap: t.spacing.xl }}>
          <View style={{ gap: t.spacing.sm }}>
            <Txt variant="footnote" tone="soft">
              Niches
            </Txt>
            <ChipWrap>
              {NICHES.map((n) => (
                <Chip key={n} label={n} selected={niche.includes(n)} onPress={() => setNiche((p) => toggle(p, n))} />
              ))}
            </ChipWrap>
          </View>

          <View style={{ gap: t.spacing.sm }}>
            <Txt variant="footnote" tone="soft">
              Formats
            </Txt>
            <ChipWrap>
              {COLLAB_TYPES.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  selected={collabTypes.includes(c)}
                  onPress={() => setCollabTypes((p) => toggle(p, c))}
                />
              ))}
            </ChipWrap>
          </View>

          <View style={{ gap: t.spacing.sm }}>
            <Txt variant="footnote" tone="soft">
              Languages
            </Txt>
            <ChipWrap>
              {LANGUAGES.map((l) => (
                <Chip
                  key={l}
                  label={l}
                  selected={languages.includes(l)}
                  onPress={() => setLanguages((p) => toggle(p, l))}
                />
              ))}
            </ChipWrap>
          </View>
        </View>
      ),
    },
    {
      title: 'Rate and location',
      subtitle: 'You can change these any time.',
      valid: !!priceRange && !!state,
      body: (
        <View style={{ gap: t.spacing.xl }}>
          <View style={{ gap: t.spacing.sm }}>
            <Txt variant="footnote" tone="soft">
              Typical rate per collaboration
            </Txt>
            <ChipWrap>
              {PRICE_TIERS.map((p) => (
                <Chip
                  key={p.value}
                  label={`${p.label} · ${p.range}`}
                  selected={priceRange === p.value}
                  onPress={() => setPriceRange(p.value)}
                />
              ))}
            </ChipWrap>
          </View>

          <Field label="City" value={city} onChangeText={setCity} placeholder="Bengaluru" />

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
