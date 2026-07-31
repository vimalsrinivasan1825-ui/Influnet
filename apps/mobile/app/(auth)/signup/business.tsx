import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BUDGET_RANGES,
  BUSINESS_TYPES,
  COLLAB_TYPES,
  INDIAN_STATES,
  INDUSTRIES,
  isValidGstin,
  isValidWebsite,
  normalizeWebsite,
} from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { completeSignup } from '@/lib/use-signup';
import { usePhoneOtp, useOtpRequirement } from '@/lib/use-phone-otp';
import { WizardStep } from '@/components/wizard';
import { PhoneOtpStep } from '@/components/phone-otp-step';
import { Chip, ChipWrap, Field, Txt } from '@/components/ui';

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
  const [registeredAddress, setRegisteredAddress] = useState('');
  const [gstNumber, setGstNumber] = useState('');

  const otp = usePhoneOtp();
  const otpRequired = useOtpRequirement();

  // Both optional, so blank stays valid — only a filled-in value is checked.
  // Mirrors the web wizard's gstValid / websiteValid.
  const gstValid = !gstNumber.trim() || isValidGstin(gstNumber);
  const websiteValid = !website.trim() || isValidWebsite(website);

  async function submit() {
    setBusy(true);
    setError(null);

    const result = await completeSignup(email, password, {
      role: 'business_owner',
      name: name.trim(),
      // Phone is collected either way; the token only exists when the gate is on
      // and register ignores it when off.
      phone: otp.phone.trim() || undefined,
      phoneVerificationToken: otp.token ?? undefined,
      companyName: company.trim(),
      industry,
      businessType: businessType || undefined,
      marketingBudget: budget || undefined,
      collabPreferences,
      // Normalised the same way web does, so the stored value has a scheme and
      // passes the WebsiteSchema transform server-side.
      website: website.trim() ? normalizeWebsite(website) : undefined,
      registeredAddress: registeredAddress.trim() || undefined,
      gstNumber: gstNumber.trim() ? gstNumber.trim().toUpperCase() : undefined,
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
    // New businesses land on the review screen, not the tabs.
    router.replace('/');
  }

  const next = () => (step === steps.length - 1 ? void submit() : setStep((s) => s + 1));

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
    // Always present: the number is collected either way. Only the verification
    // requirement is server-driven — see useOtpRequirement().
    {
      title: otpRequired ? 'Verify your mobile' : 'Your mobile number',
      subtitle:
        otpRequired === null
          ? 'Checking whether verification is required…'
          : otpRequired
            ? 'We text you a 6-digit code. Creators trust verified businesses.'
            : 'So creators can reach you about collaborations.',
      // `null` means the requirement is still loading — see the creator wizard.
      valid: otpRequired === null ? false : otpRequired ? !!otp.token : true,
      body: <PhoneOtpStep otp={otp} required={otpRequired === true} />,
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
      // Registered address is required on web too — it is what the review team
      // checks the business against.
      valid: !!state && !!city.trim() && !!registeredAddress.trim() && gstValid && websiteValid,
      body: (
        <View style={{ gap: t.spacing.xl }}>
          <Field
            label="Website"
            value={website}
            onChangeText={setWebsite}
            placeholder="kadaifoods.com"
            autoCapitalize="none"
            keyboardType="url"
            error={websiteValid ? null : 'Enter a valid website (e.g. yourcompany.com)'}
          />
          <Field label="City" value={city} onChangeText={setCity} placeholder="Chennai" />

          <Field
            label="Registered address"
            value={registeredAddress}
            onChangeText={setRegisteredAddress}
            placeholder="12, Anna Salai, Chennai 600002"
            multiline
            hint="Used by our team to verify your business."
          />

          <Field
            label="GST number"
            value={gstNumber}
            onChangeText={(v) => setGstNumber(v.toUpperCase())}
            placeholder="33ABCDE1234F1Z5"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={15}
            error={gstValid ? null : 'That does not look like a valid GSTIN.'}
            hint="Optional, but it speeds up review."
          />

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
