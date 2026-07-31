import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Check, Sparkles, X } from 'lucide-react-native';
import { COLLAB_TYPES, INDIAN_STATES, LANGUAGES, NICHES, PRICE_TIERS } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { completeSignup, useUsernameAvailability, useEmailAvailability, useUsernameSuggestions, useInstagramAvailability } from '@/lib/use-signup';
import { usePhoneOtp, useOtpRequirement } from '@/lib/use-phone-otp';
import { WizardStep } from '@/components/wizard';
import { PhoneOtpStep } from '@/components/phone-otp-step';
import { Button, Chip, ChipWrap, Field, Txt } from '@/components/ui';

/** Toggle a value in a multi-select list. */
function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Same four options the web wizard offers, same stored values. */
const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non-binary', label: 'Non-binary' },
  { value: 'prefer-not-to-say', label: 'Prefer not to say' },
];

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
  const [youtube, setYoutube] = useState('');
  const [twitter, setTwitter] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState('');
  const [niche, setNiche] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [collabTypes, setCollabTypes] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  // Instagram prefill. Web makes this its own first step ("Connect") and pulls
  // name, bio and follower count off the handle before the user types any of
  // them. Mobile asked for all three by hand, which is the same wizard with more
  // typing on the worse keyboard — and it also meant mobile signups arrived with
  // no instagram_followers, so those creators ranked lower in discovery until
  // their first profile refresh.
  //
  // Attached to the socials step rather than promoted to its own screen: the
  // handle is already collected there, and one more full-screen step before an
  // account exists is a real drop-off cost on a phone.
  const [prefilling, setPrefilling] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [instagramFollowers, setInstagramFollowers] = useState<number | null>(null);

  async function prefillFromInstagram() {
    const handle = instagram.trim().replace(/^@/, '');
    if (!handle) return;

    setPrefilling(true);
    setPrefillError(null);

    const res = await endpoints.scrapeInstagram<{
      profile: { fullName: string | null; biography: string | null; followerCount: number | null };
    }>(handle);
    setPrefilling(false);

    if (!res.ok) {
      setPrefillError(res.error ?? "We couldn't reach Instagram. You can fill this in yourself.");
      return;
    }

    const p = res.data?.profile;
    if (!p) {
      setPrefillError('No public profile found for that handle.');
      return;
    }

    // Never overwrite what the user already typed — same rule as web. The scrape
    // is a convenience, not an authority on their own details.
    if (p.fullName && !name.trim()) setName(p.fullName);
    if (p.biography && !bio.trim()) setBio(p.biography);
    if (typeof p.followerCount === 'number') setInstagramFollowers(p.followerCount);
    setPrefilled(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const availability = useUsernameAvailability(username);
  const { suggestions, loading: suggestionsLoading } = useUsernameSuggestions(name, username.length === 0);
  const emailAvailability = useEmailAvailability(email);
  const instagramAvailability = useInstagramAvailability(instagram);
  const otp = usePhoneOtp();
  const otpRequired = useOtpRequirement();

  // Fail open on a failed check, exactly as the web wizard does: register_profile
  // still enforces uniqueness, so a flaky network must not hard-block signup.
  const usernameOk = availability === 'available' || availability === 'error';
  const emailOk = emailAvailability.status === 'available' || emailAvailability.status === 'error';

  async function submit() {
    setBusy(true);
    setError(null);

    // Final guard before the auth user is created: the live check gates the
    // handle step, but the name can be claimed while someone works through the
    // later steps. Catching it here avoids an orphaned auth account with no
    // profile — the same reason web re-checks at submit time.
    const recheck = await endpoints.checkUsername(username.trim().toLowerCase());
    const checked = recheck.data as { available?: boolean; valid?: boolean } | null;
    if (recheck.ok && checked?.available === false) {
      setBusy(false);
      setError('That username was just taken by someone else — pick another.');
      setStep(1);
      return;
    }

    const result = await completeSignup(email, password, {
      role: 'influencer',
      name: name.trim(),
      // Phone is collected either way; the token only exists when the gate is on
      // and register ignores it when off.
      phone: otp.phone.trim() || undefined,
      phoneVerificationToken: otp.token ?? undefined,
      username: username.trim().toLowerCase(),
      instagramHandle: instagram.trim().replace(/^@/, '') || undefined,
      // Only sent when the scrape actually returned one, matching web. Without
      // it a mobile signup landed with instagram_followers NULL and ranked
      // below equivalent web signups in discovery until the first refresh.
      instagramFollowers: instagramFollowers ?? undefined,
      youtubeHandle: youtube.trim().replace(/^@/, '') || undefined,
      twitterHandle: twitter.trim().replace(/^@/, '') || undefined,
      bio: bio.trim() || undefined,
      gender: gender || undefined,
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
      setError(
        'Check your email to confirm your address, then sign in — your details are saved.'
      );
      return;
    }
    router.replace('/');
  }

  const next = () => (step === steps.length - 1 ? void submit() : setStep((s) => s + 1));

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
      valid: usernameOk,
      body: (
        <View style={{ gap: t.spacing.lg }}>
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
                : availability === 'error'
                  ? 'Could not check right now — try again in a moment.'
                  : null
          }
          right={
            availability === 'checking' ? (
              <ActivityIndicator size="small" color={t.color.contentMuted} />
            ) : availability === 'available' ? (
              <Check size={19} color={t.color.ok} />
            ) : availability === 'taken' || availability === 'error' ? (
              <X size={19} color={t.color.danger} />
            ) : null
          }
        />
        {suggestions.length > 0 && (
          <View style={{ gap: t.spacing.sm, marginTop: t.spacing.md }}>
            <Txt variant="footnote" tone="soft">Try:</Txt>
            <ChipWrap>
              {suggestions.map((s) => (
                <Chip key={s} label={s} selected={false} onPress={() => setUsername(s)} />
              ))}
            </ChipWrap>
          </View>
        )}
      </View>
    ),
  },
  {
    title: 'Create your login',
    valid: /\S+@\S+\.\S+/.test(email) && password.length >= 8 && emailOk,
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
          error={emailAvailability.status === 'taken' || emailAvailability.status === 'invalid' ? emailAvailability.message : null}
          hint={emailAvailability.status === 'available' ? emailAvailability.message : null}
          right={
            emailAvailability.status === 'checking' ? (
              <ActivityIndicator size="small" color={t.color.contentMuted} />
            ) : emailAvailability.status === 'available' ? (
              <Check size={19} color={t.color.ok} />
            ) : emailAvailability.status === 'taken' || emailAvailability.status === 'error' ? (
              <X size={19} color={t.color.danger} />
            ) : null
          }
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
    // Always present: the number is collected either way. Only the verification
    // requirement is server-driven — see useOtpRequirement().
    {
      title: otpRequired ? 'Verify your mobile' : 'Your mobile number',
      subtitle:
        otpRequired === null
          ? 'Checking whether verification is required…'
          : otpRequired
            ? 'We text you a 6-digit code. Brands trust verified numbers.'
            : 'So brands can reach you about collaborations.',
      // `null` means the requirement is still loading. Blocking for that moment
      // is safer than letting someone past a gate that turns out to be on, which
      // register would then reject with the account already created.
      valid: otpRequired === null ? false : otpRequired ? !!otp.token : true,
      body: <PhoneOtpStep otp={otp} required={otpRequired === true} />,
    },
    {
      title: 'Link your socials',
      subtitle: 'We pull your follower count and engagement so brands see real numbers.',
      // Web requires at least one handle rather than Instagram specifically.
      valid:
        (instagram.trim().length > 1 && instagramAvailability.status !== 'taken' && instagramAvailability.status !== 'invalid') || youtube.trim().length > 1 || twitter.trim().length > 1,
      body: (
        <View style={{ gap: t.spacing.lg }}>
          <View style={{ gap: t.spacing.sm }}>
              <Field
                label="Instagram handle"
                value={instagram}
                onChangeText={(v) => {
                  setInstagram(v.replace(/^@/, ''));
                  // A changed handle invalidates whatever the last one pulled in.
                  if (prefilled) setPrefilled(false);
                  if (prefillError) setPrefillError(null);
                }}
                placeholder="@yourhandle"
                autoCapitalize="none"
                autoCorrect={false}
                error={instagramAvailability.status === 'taken' || instagramAvailability.status === 'invalid' ? instagramAvailability.message : prefillError}
                hint={instagramAvailability.status === 'available' ? instagramAvailability.message : null}
                right={
                  instagramAvailability.status === 'checking' ? (
                    <ActivityIndicator size="small" color={t.color.contentMuted} />
                  ) : instagramAvailability.status === 'available' ? (
                    <Check size={19} color={t.color.ok} />
                  ) : instagramAvailability.status === 'taken' || instagramAvailability.status === 'error' ? (
                    <X size={19} color={t.color.danger} />
                  ) : null
                }
              />
            <Button
              label={
                prefilling
                  ? 'Fetching your profile…'
                  : prefilled
                    ? 'Details pulled in'
                    : 'Fetch my details from Instagram'
              }
              icon={
                prefilled ? (
                  <Check size={16} color={t.color.ok} />
                ) : (
                  <Sparkles size={16} color={t.color.content} />
                )
              }
              variant="secondary"
              size="md"
              onPress={prefillFromInstagram}
              disabled={instagram.trim().length < 2 || prefilling || prefilled || instagramAvailability.status === 'checking' || instagramAvailability.status === 'taken' || instagramAvailability.status === 'invalid'}
              loading={prefilling}
            />
            {prefilled ? (
              <Txt variant="footnote" tone="ok">
                {instagramFollowers != null
                  ? `Found ${instagramFollowers.toLocaleString('en-IN')} followers. We filled in anything you'd left blank.`
                  : "We filled in anything you'd left blank."}
              </Txt>
            ) : (
              <Txt variant="footnote" tone="muted">
                Optional — saves you typing, and lets brands see real follower
                numbers straight away.
              </Txt>
            )}
          </View>
          <Field
            label="YouTube channel"
            value={youtube}
            onChangeText={setYoutube}
            placeholder="@yourchannel"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label="X (Twitter) handle"
            value={twitter}
            onChangeText={setTwitter}
            placeholder="@yourhandle"
            autoCapitalize="none"
            autoCorrect={false}
            hint="At least one of the three, so brands can see your work."
          />
        </View>
      ),
    },
    {
      title: 'What do you make?',
      subtitle: 'Pick the niches and formats you work in. Brands filter by these.',
      valid: niche.length > 0 && collabTypes.length > 0 && bio.trim().length > 0,
      body: (
        <View style={{ gap: t.spacing.xl }}>
          <Field
            label="Short bio"
            value={bio}
            onChangeText={setBio}
            placeholder="Food and travel creator from Chennai. I make recipe reels and honest restaurant reviews."
            multiline
            hint="This is the first thing brands read on your profile."
          />

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
      valid: !!priceRange && !!state && !!gender,
      body: (
        <View style={{ gap: t.spacing.xl }}>
          <View style={{ gap: t.spacing.sm }}>
            <Txt variant="footnote" tone="soft">
              Gender
            </Txt>
            <ChipWrap>
              {GENDERS.map((g) => (
                <Chip
                  key={g.value}
                  label={g.label}
                  selected={gender === g.value}
                  onPress={() => setGender(g.value)}
                />
              ))}
            </ChipWrap>
          </View>

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
      total={steps.length}
      title={current.title}
      subtitle={current.subtitle}
      onNext={next}
      nextLabel={step === steps.length - 1 ? 'Create account' : 'Continue'}
      nextDisabled={!current.valid || busy}
      busy={busy}
      error={error}
    >
      {current.body}
    </WizardStep>
  );
}
