/**
 * Signup wizard step: verify a mobile number with an SMS OTP (2Factor).
 *
 * State lives in usePhoneOtp() so the wizard can read `token` for its own
 * step-valid check and pass it to register.
 */
import { ActivityIndicator, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Button, Field, Txt } from '@/components/ui';
import type { PhoneOtpState } from '@/lib/use-phone-otp';

export function PhoneOtpStep({ otp }: { otp: PhoneOtpState }) {
  const t = useTheme();
  const verified = !!otp.token;
  const phoneUsable = otp.phone.replace(/\D/g, '').length >= 10;

  return (
    <View style={{ gap: t.spacing.lg }}>
      <Field
        label="Mobile number"
        value={otp.phone}
        onChangeText={otp.setPhone}
        placeholder="+91 98765 43210"
        keyboardType="phone-pad"
        autoComplete="tel"
        editable={!verified}
        error={otp.error}
        hint={verified ? null : otp.notice ?? "We'll text you a code to confirm this number."}
        right={verified ? <ShieldCheck size={19} color={t.color.ok} /> : null}
      />

      {verified ? (
        <>
          <Txt variant="footnote" style={{ color: t.color.ok }}>
            Mobile number verified.
          </Txt>
          {/* Verifying locks the field, so without this a mistyped-but-verified
              number would be a dead end. Re-setting the phone clears the token. */}
          <Button
            variant="ghost"
            label="Use a different number"
            onPress={() => otp.setPhone(otp.phone)}
          />
        </>
      ) : (
        <>
          <Button
            variant="secondary"
            onPress={() => void otp.sendOtp()}
            disabled={!phoneUsable || otp.sending || otp.resendIn > 0}
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
            <Field
              label="6-digit code"
              value={otp.code}
              onChangeText={(v) => {
                const digits = v.replace(/\D/g, '').slice(0, 6);
                otp.setCode(digits);
                // Auto-submit on the sixth digit — one less tap, and the code is
                // usually being pasted from the SMS anyway.
                if (digits.length === 6) void otp.verifyOtp(digits);
              }}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={6}
              editable={!otp.verifying}
              right={
                otp.verifying ? (
                  <ActivityIndicator size="small" color={t.color.contentMuted} />
                ) : null
              }
              hint="Enter the code we texted you."
            />
          ) : null}
        </>
      )}
    </View>
  );
}
