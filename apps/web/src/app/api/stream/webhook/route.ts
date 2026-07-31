import { NextResponse } from 'next/server';
import { getStreamClient } from '@/lib/stream';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types';

/**
 * GetStream Webhook Receiver
 * Configured via scripts/setup-stream-webhook.mjs, which registers this URL as
 * a v2 event hook (Dashboard -> App -> Chat -> Event Hooks).
 */
export async function POST(req: Request) {
  try {
    const signature = req.headers.get('x-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing x-signature header' }, { status: 401 });
    }

    /**
     * Read the body as BYTES, not text.
     *
     * Stream gzips webhook payloads on the wire but signs the *uncompressed*
     * JSON. Reading with req.text() decodes those gzip bytes as UTF-8 — 0x8b in
     * the gzip magic number is not valid UTF-8, so it becomes a replacement
     * character and the body is corrupted before it is ever hashed. Every real
     * delivery then failed the signature check and Stream got a 401, which is
     * why messages arrived in the chat but never produced a notification.
     *
     * verifyAndParseWebhook gunzips when the body starts with the gzip magic
     * bytes and passes it through untouched when it does not, so this stays
     * correct for uncompressed deliveries and behind any middleware that
     * decompresses the request for us.
     */
    const rawBody = Buffer.from(await req.arrayBuffer());
    const client = getStreamClient();

    let event: Record<string, any>;
    try {
      event = client.verifyAndParseWebhook(rawBody, signature) as Record<string, any>;
    } catch (err) {
      console.error('[Stream Webhook] Invalid signature:', (err as Error).message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // We only care about new messages to persist them to our Postgres DB
    if (event.type === 'message.new') {
      // Event hooks carry `channel_id`, but `cid` ("messaging:conv_UUID") is the
      // field that is always present — fall back to it rather than silently
      // dropping the event when only the cid is sent.
      const channelId: string | undefined =
        event.channel_id ?? (typeof event.cid === 'string' ? event.cid.split(':')[1] : undefined);
      const message = event.message;
      const senderId = message?.user?.id;
      const messageText = message?.text;

      if (!channelId || !channelId.startsWith('conv_') || !senderId || !messageText) {
        return NextResponse.json({ ok: true }); // Malformed but acknowledged
      }

      const conversationId = channelId.replace('conv_', '');

      // Use the service-role client because webhooks don't have a user JWT
      const supabaseAdmin = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      /**
       * Mirror the message into Postgres.
       *
       * A failure here is logged and then deliberately ignored rather than
       * returned as a 500. Stream is the source of truth for chat (this table
       * is a history mirror), and returning 500 made the notification a hostage
       * to the mirror: the handler returned before the notify block below, so a
       * single bad row meant the recipient was never told at all. It also meant
       * Stream retried the delivery, which would re-notify on every attempt.
       */
      const { error: insertError } = await supabaseAdmin
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_user_id: senderId,
          body: messageText,
          // created_at will default to now()
        });

      if (insertError) {
        console.error('[Stream Webhook] Failed to mirror message:', insertError);
      }

      // Update the conversation's updated_at timestamp to bump it to the top
      const { error: updateError } = await supabaseAdmin
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      if (updateError) {
        console.error('[Stream Webhook] Failed to update conversation:', updateError);
      }

      // Notify the recipient(s) via push and in-app notifications
      try {
        const { data: participants } = await supabaseAdmin
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conversationId)
          .neq('user_id', senderId);

        // A conversation with no other participant row is a broken conversation,
        // not a quiet no-op — say so, because the symptom (chat works, nothing
        // is ever announced) is otherwise indistinguishable from this handler
        // never running.
        if (!participants || participants.length === 0) {
          console.warn(
            `[Stream Webhook] No recipient participants for conversation ${conversationId} — nobody notified`,
          );
        }

        if (participants && participants.length > 0) {
          const { data: senderProfile } = await supabaseAdmin
            .from('profiles')
            .select('name')
            .eq('id', senderId)
            .maybeSingle();

          const senderName = senderProfile?.name || message.user?.name || 'A user';
          const { notifyUser } = await import('@/lib/notify');

          for (const p of participants) {
            await notifyUser({
              userId: p.user_id,
              type: 'message',
              title: `New message from ${senderName}`,
              body: messageText.length > 100 ? messageText.slice(0, 97) + '...' : messageText,
              link: `/dashboard/messages?conv=${conversationId}`,
            });
          }
        }
      } catch (notifErr) {
        console.error('[Stream Webhook] Failed to notify user:', notifErr);
      }
    }

    // Acknowledge receipt of the webhook (important for Stream to stop retrying)
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[Stream Webhook] Exception:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
