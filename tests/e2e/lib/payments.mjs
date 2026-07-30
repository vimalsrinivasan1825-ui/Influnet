// Simulates a real Razorpay webhook callback so the payment-confirmation
// pipeline (signature verification, ledger update, auto-completing the
// payment gate checklist item) can be tested without a publicly-reachable
// endpoint for Razorpay's real servers to call back to. The order itself is
// real — created via the app's own API against Razorpay's live test-mode
// REST API — only the "capture confirmation" leg is simulated, using the
// exact same webhook secret the server reads from env.
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function readWebhookSecret() {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'web', '.env.local');
  const content = readFileSync(envPath, 'utf8');
  const match = content.match(/^RAZORPAY_WEBHOOK_SECRET=(.*)$/m);
  if (!match) throw new Error('RAZORPAY_WEBHOOK_SECRET not found in apps/web/.env.local');
  return match[1].trim();
}

export async function simulateCapturedPayment({ baseUrl, orderId, paymentId, amountPaise, currency = 'INR' }) {
  const secret = readWebhookSecret();
  const payload = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount: amountPaise,
          currency,
          status: 'captured',
        },
      },
    },
  };
  const rawBody = JSON.stringify(payload);
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');

  const res = await fetch(`${baseUrl}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature },
    body: rawBody,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
