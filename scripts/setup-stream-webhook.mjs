#!/usr/bin/env node
/**
 * Setup Stream Chat Webhook
 * Configures Stream Chat event hooks (v2) to point to your target server URL.
 * Usage:
 *   node scripts/setup-stream-webhook.mjs https://dev.influnet.io/api/stream/webhook
 */

import { StreamChat } from 'stream-chat';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local from apps/web if present
dotenv.config({ path: path.join(__dirname, '../apps/web/.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const apiKey = process.env.STREAM_API_KEY || process.env.NEXT_PUBLIC_STREAM_API_KEY;
const apiSecret = process.env.STREAM_API_SECRET;

if (!apiKey || !apiSecret) {
  console.error('❌ Error: Missing STREAM_API_KEY or STREAM_API_SECRET environment variables.');
  process.exit(1);
}

const targetUrl = process.argv[2] || 'https://dev.influnet.io/api/stream/webhook';
console.log(`🔌 Connecting to Stream Chat (Key: ${apiKey})...`);

const client = StreamChat.getInstance(apiKey, apiSecret);

async function main() {
  try {
    console.log(`⚙️  Configuring webhook URL to: ${targetUrl}`);
    await client.updateAppSettings({
      event_hooks: [
        {
          hook_type: 'webhook',
          webhook_url: targetUrl,
          enabled: true,
          event_types: ['message.new', 'message.updated', 'message.deleted'],
        },
      ],
    });

    const settings = await client.getAppSettings();
    console.log('✅ Stream Chat Event Hooks configured successfully:');
    console.log(JSON.stringify(settings.app?.event_hooks, null, 2));
  } catch (error) {
    console.error('❌ Failed to update Stream Chat settings:', error);
    process.exit(1);
  }
}

main();
