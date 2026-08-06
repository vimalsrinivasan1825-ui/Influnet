/**
 * Signup wizard step: verify a mobile number with an SMS OTP (2Factor).
 *
 * State lives in usePhoneOtp() so the wizard can read `token` for its own
 * step-valid check and pass it to register.
 */
import { useRef } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { isValidIndianPhone, sanitizePhoneInput } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { usePhoneAvailability } from '@/lib/use-signup';
import { Button, Field, Txt } from '@/components/ui';
import type { PhoneOtpState } from '@/lib/use-phone-otp';

const OTP_LENGTH = 6;

/**
 * Six-box OTP entry. A single field asked people to read "123456" off an SMS
 * banner and retype it correctly on a numeric keyboard — boxes are the
 * pattern every bank/OTP app already trained users on, and they make partial
 * entry state ("3 of 6 typed") visible at a glance.
 *
 * Still a single source of truth (the wizard's `otp.code` string) — each box
 * is just a view over one character of it, so paste-the-whole-code and
 * OS SMS autofill both keep working the same way a single field did.
 */
function OtpBoxes({
  value,
  onChangeText,
  editable,
}: {
  value: string;
  onChangeText: (next: string) => void;
  editable: boolean;
}) {
  const t = useTheme();
  const boxes = useRef<Array<TextInput | null>>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? '');

  function setDigitAt(index: number, text: string) {
    const clean = text.replace(/\D/g, '');

    if (clean.length > 1) {
      // A paste or SMS autofill landed multiple digits in one box — spread
      // them across the boxes from here on, same as the old field did.
      const next = (value.slice(0, index) + clean).slice(0, OTP_LENGTH);
      onChangeText(next);
      boxes.current[Math.min(next.length, OTP_LENGTH - 1)]?.focus();
      return;
    }

    const chars = value.padEnd(OTP_LENGTH, ' ').split('');
    chars[index] = clean;
    onChangeText(chars.join('').trimEnd());

    if (clean && index < OTP_LENGTH - 1) {
      boxes.current[index + 1]?.focus();
    }
  }

  function handleBackspace(index: number) {
    if (digits[index] || index === 0) return;
    // Empty box, backspace pressed: clear the previous box and land the
    // caret there, so holding backspace walks left one box at a time.
    const chars = value.padEnd(OTP_LENGTH, ' ').split('');
    chars[index - 1] = '';
    onChangeText(chars.join('').trimEnd());
    boxes.current[index - 1]?.focus();
  }

  return (
    <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
      {digits.map((digit, i) => (
        <TextInput
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          value={digit}
          onChangeText={(text) => setDigitAt(i, text)}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === 'Backspace') handleBackspace(i);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete={i === 0 ? 'sms-otp' : 'off'}
          editable={editable}
          selectTextOnFocus
          style={{
            flex: 1,
            height: 56,
            borderWidth: 1,
            borderColor: digit ? t.color.brand : t.color.hairlineStrong,
            borderRadius: t.radii.md,
            backgroundColor: t.color.surfaceCard,
            textAlign: 'center',
            fontSize: t.typography.body.fontSize + 6,
            fontWeight: '700',
            color: t.color.content,
          }}
        />
      ))}
    </View>
  );
}

export function PhoneOtpStep({
  otp,
  /**
   * False when the server has the OTP gate off. The number is still collected —
   * it just isn't verified, matching how the web field degrades to a plain
   * input (apps/web/src/components/signup/phone-otp-field.tsx).
   */
  required = true,
}: {
  otp: PhoneOtpState;
  required?: boolean;
}) {
  const t = useTheme();
  const verified = !!otp.token;
  // Used to be `length >= 10` — a lower bound only, so a long paste satisfied
  // it and reached Send OTP, spending a real 2Factor call on a number that
  // could never verify.
  const phoneUsable = isValidIndianPhone(otp.phone);
  // `keyboardType="phone-pad"` keeps a physical/bluetooth keyboard's letters
  // off the native numeric pad on most devices, but paste and autofill don't
  // go through the keyboard at all — filter what actually lands in the field.
  //
  // The slice happens AFTER sanitizing, not via the Field's own `maxLength` —
  // RN's maxLength truncates the raw pasted text before onChangeText ever
  // runs, so a native cap of 20 on "88777899797abcXYZ989869869" keeps mostly
  // letters and drops most of the real digits. Same fix as the web field.
  const handlePhoneChange = (raw: string) => otp.setPhone(sanitizePhoneInput(raw).slice(0, 20));

  const { status: phoneStatus, message: phoneMessage } = usePhoneAvailability(otp.phone);
  const phoneOk = phoneStatus === 'available' || phoneStatus === 'error';
  const invalidMessage = phoneStatus === 'invalid' ? phoneMessage : undefined;

  if (!required) {
    return (
      <Field
        label="Mobile number"
        value={otp.phone}
        onChangeText={handlePhoneChange}
        placeholder="+91 98765 43210"
        keyboardType="phone-pad"
        autoComplete="tel"
        autoFocus
        maxLength={64}
        error={invalidMessage || (phoneStatus === 'taken' ? phoneMessage : undefined)}
        hint={phoneStatus === 'available' ? phoneMessage : "Optional. Brands use this to reach you about collaborations."}
      />
    );
  }

  return (
    <View style={{ gap: t.spacing.lg }}>
      <Field
        label="Mobile number"
        value={otp.phone}
        onChangeText={handlePhoneChange}
        placeholder="+91 98765 43210"
        keyboardType="phone-pad"
        autoComplete="tel"
        editable={!verified}
        maxLength={64}
        error={otp.error || invalidMessage || (phoneStatus === 'taken' ? phoneMessage : undefined)}
        hint={verified ? null : otp.notice || (phoneStatus === 'available' ? phoneMessage : "We'll text you a code to confirm this number.")}
        right={phoneStatus === 'checking' ? <ActivityIndicator size="small" color={t.color.contentMuted} /> : verified ? <ShieldCheck size={19} color={t.color.ok} /> : null}
      />

      {verified ? (
        <View style={{ paddingVertical: t.spacing.sm }}>
          <Txt variant="bodyStrong" style={{ color: t.color.ok }}>
            Your number has been verified.
          </Txt>
        </View>
      ) : (
        <>
          <Button
            variant="secondary"
            onPress={() => void otp.sendOtp()}
            disabled={!phoneUsable || !phoneOk || otp.sending || otp.resendIn > 0}
            label={
              otp.sending
                ? 'Sending…'
                : otp.resendIn > 0
                  ? `Resend in ${otp.resendIn}s`
                  : otp.codeSent
                    ? 'Resend OTP'
                    : 'Send OTP'
            }
          />

          {otp.codeSent ? (
            <View style={{ gap: 6 }}>
              <Txt variant="footnote" tone="soft">
                6-digit code
              </Txt>
              <OtpBoxes
                value={otp.code}
                onChangeText={(digits) => {
                  otp.setCode(digits);
                  // Auto-submit on the sixth digit — one less tap, and the code is
                  // usually being pasted from the SMS anyway.
                  if (digits.length === 6) void otp.verifyOtp(digits);
                }}
                editable={!otp.verifying}
              />
              {otp.verifying ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ActivityIndicator size="small" color={t.color.contentMuted} />
                  <Txt variant="footnote" tone="muted">
                    Verifying…
                  </Txt>
                </View>
              ) : (
                <Txt variant="footnote" tone="muted">
                  Enter the code we texted you.
                </Txt>
              )}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
