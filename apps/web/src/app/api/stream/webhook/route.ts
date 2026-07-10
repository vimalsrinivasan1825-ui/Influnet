import { NextResponse } from 'next/server';
import { getStreamClient } from '@/lib/stream';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types';

/**
 * GetStream Webhook Receiver
 * To enable this, you must configure the webhook URL in the GetStream Dashboard:
 * Dashboard -> App -> Chat -> Overview -> Webhooks
 * Set the URL to your production URL (or ngrok URL for local dev) + /api/stream/webhook
 */
export async function POST(req: Request) {
  try {
    const signature = req.headers.get('x-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing x-signature header' }, { status: 401 });
    }

    const rawBody = await req.text();
    const client = getStreamClient();

    // Verify that the request actually came from GetStream
    const valid = client.verifyWebhook(rawBody, signature);
    if (!valid) {
      console.error('[Stream Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(rawBody);

    // We only care about new messages to persist them to our Postgres DB
    if (event.type === 'message.new') {
      const channelId = event.channel_id; // e.g., 'conv_UUID'
      const message = event.message;
      const senderId = message.user?.id;
      const messageText = message.text;
      
      if (!channelId || !channelId.startsWith('conv_') || !senderId || !messageText) {
        return NextResponse.json({ ok: true }); // Malformed but acknowledged
      }

      const conversationId = channelId.replace('conv_', '');

      // Use the service-role client because webhooks don't have a user JWT
      const supabaseAdmin = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Insert message into our local database
      const { error: insertError } = await supabaseAdmin
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_user_id: senderId,
          body: messageText,
          // created_at will default to now()
        });

      if (insertError) {
        console.error('[Stream Webhook] Failed to insert message:', insertError);
        // We return 200 anyway so Stream doesn't keep retrying excessively if it's our DB fault,
        // but typically you might return 500. Let's return 500 to allow Stream to retry.
        return NextResponse.json({ error: 'Database insert failed' }, { status: 500 });
      }

      // Update the conversation's updated_at timestamp to bump it to the top
      const { error: updateError } = await supabaseAdmin
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      if (updateError) {
        console.error('[Stream Webhook] Failed to update conversation:', updateError);
      }
    }

    // Acknowledge receipt of the webhook (important for Stream to stop retrying)
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[Stream Webhook] Exception:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
