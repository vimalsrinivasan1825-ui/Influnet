import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 2Factor template name. This must be a DLT-APPROVED SMS template on the
// account — an unapproved name is silently downgraded to a VOICE CALL. The
// send still returns Success and still bills an SMS credit, so a wrong name
// here looks like it works.
// `Authentication_OTP` is the current approved template (replaced
// `Login_Verification_OTP`, verified 2026-07-30, retired 2026-08-07).
// Override per-project with the TWOFACTOR_TEMPLATE secret.
const TEMPLATE = Deno.env.get("TWOFACTOR_TEMPLATE") ?? "Authentication_OTP";

// Must not exceed the validity stated in the DLT template text ("valid for
// 5 minutes"). If our session outlived the provider's OTP, a code entered at
// minute 7 would fail as a mismatch — which reads as "wrong code" to the user.
const OTP_TTL_MINUTES = 5;

type TwoFactorResponse = {
  Status?: string;
  Details?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callTwoFactor(path: string): Promise<TwoFactorResponse> {
  const apiKey = Deno.env.get("TWOFACTOR_API_KEY");
  if (!apiKey) {
    throw new Error("TWOFACTOR_API_KEY is not configured");
  }
  const url = `https://2factor.in/API/V1/${apiKey}/${path}`;
  const res = await fetch(url, { method: "GET" });
  const data = (await res.json()) as TwoFactorResponse;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const action = String(body.action || "");

    if (action === "send") {
      const phone = String(body.phone || "");
      const purpose = String(body.purpose || "signup");
      const userId = body.userId ? String(body.userId) : null;

      const { data: allowed, error: allowErr } = await sb.rpc("phone_otp_send_allowed", {
        p_phone: phone,
      });
      if (allowErr) return json({ error: allowErr.message }, 500);
      if (!allowed?.allowed) {
        const reason = allowed?.reason || "not_allowed";
        const errorMsg =
          reason === "rate_limited"
            ? "Too many OTP requests this hour. Please wait before trying again."
            : reason === "cooldown"
              ? "Please wait a moment before requesting another code."
              : "Enter a valid mobile number.";
        return json(
          {
            error: errorMsg,
            reason,
            retryAfterSec: allowed?.retryAfterSec || (reason === "cooldown" ? 30 : null),
          },
          reason === "cooldown" ? 429 : 429
        );
      }

      const phoneE164 = allowed.phoneE164 as string;

      const tf = await callTwoFactor(
        `SMS/${phoneE164}/AUTOGEN/${TEMPLATE}`
      );

      if (tf.Status !== "Success" || !tf.Details) {
        await sb.rpc("phone_otp_log_audit", {
          p_phone: phone,
          p_user_id: userId,
          p_action: "send",
          p_status: "provider_failed",
          p_meta: { response: tf },
        });
        return json({ error: "Could not send OTP. Try again shortly." }, 502);
      }

      const { data: session, error: sessErr } = await sb.rpc("phone_otp_create_session", {
        p_phone: phone,
        p_provider_session_id: tf.Details,
        p_purpose: purpose,
        p_user_id: userId,
        p_ttl_minutes: OTP_TTL_MINUTES,
      });
      if (sessErr) return json({ error: sessErr.message }, 500);

      return json({
        ok: true,
        status: "otp_sent",
        providerSessionId: tf.Details,
        sessionId: session?.sessionId,
        phoneE164,
        expiresAt: session?.expiresAt,
        resendAfterSec: 30,
      });
    }

    if (action === "verify") {
      const phone = String(body.phone || "");
      const otp = String(body.otp || "").replace(/\D/g, "");
      const providerSessionId = String(body.providerSessionId || body.sessionId || "");

      if (!otp || otp.length !== 6) {
        return json({ error: "Enter the 6-digit verification code." }, 400);
      }
      if (!providerSessionId) {
        return json({ error: "OTP session expired. Send a new code." }, 400);
      }

      const { data: attempt, error: attErr } = await sb.rpc(
        "phone_otp_register_verify_attempt",
        { p_provider_session_id: providerSessionId }
      );
      if (attErr) return json({ error: attErr.message }, 500);
      if (!attempt?.ok) {
        const err = attempt?.error || "verify_blocked";
        const msg =
          err === "expired"
            ? "OTP expired. Send a new code."
            : err === "max_attempts"
              ? "Too many attempts. Send a new code."
              : "Verification failed.";
        return json({ error: msg, reason: err, status: err }, 400);
      }

      const tf = await callTwoFactor(`SMS/VERIFY/${providerSessionId}/${otp}`);
      const details = String(tf.Details || "").trim().toLowerCase();
      const matched =
        tf.Status === "Success" &&
        (details === "otp matched" ||
          details === "otp match" ||
          details.includes("otp matched"));

      if (!matched) {
        await sb.rpc("phone_otp_mark_failed", {
          p_provider_session_id: providerSessionId,
          p_phone: phone,
          p_reason: "mismatch",
        });
        await sb.rpc("phone_otp_log_audit", {
          p_phone: phone,
          p_user_id: null,
          p_action: "verify_fail",
          p_status: "provider_mismatch",
          p_meta: { response: tf, providerSessionId },
        });
        const mismatch =
          details.includes("mismatch") || tf.Status === "Error"
            ? "Incorrect code. Tap Resend OTP for a new code."
            : "Incorrect code. Try again.";
        return json({
          error: mismatch,
          status: "failed",
          attemptsRemaining: Math.max(0, 5 - (attempt?.session?.verify_attempts || 0)),
          providerResponse: tf,
        }, 400);
      }

      const { data: verified, error: verErr } = await sb.rpc("phone_otp_mark_verified", {
        p_provider_session_id: providerSessionId,
        p_phone: phone,
      });
      if (verErr) return json({ error: verErr.message }, 500);

      const userId = body.userId ? String(body.userId) : null;
      if (userId) {
        await sb.rpc("mark_profile_phone_verified", {
          p_user_id: userId,
          p_phone: phone,
          p_provider: "2factor",
        });
      }

      return json({
        ok: true,
        status: "verified",
        verified: true,
        verificationToken: verified?.verificationToken,
        phoneE164: verified?.phoneE164,
        providerSessionId,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Phone OTP failed";
    return json({ error: message }, 500);
  }
});
