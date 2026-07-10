# QA Testing Instructions

This document tracks all completed bugfixes and features along with instructions on how to manually verify them on your side.

## Fixes Completed

### Step 1: Messaging Webhook Payload Fix
- **What was fixed**: The Stream Webhook payload had TypeScript/Supabase errors that were causing messages not to be logged to the local database for offline tracking. The errors have been resolved.
- **How to test**:
  1. Go to your **GetStream Dashboard** > App > Webhooks.
  2. Ensure your webhook URL is set up and active (`https://<your-dev-domain>/api/stream/webhook`).
  3. Send a message in the chat.
  4. Check the GetStream Dashboard logs to ensure it receives a `200 OK`.

### Step 2: Unread Message Notification Bell
- **What was fixed**: The notification bell now correctly queries Stream to get your actual unread messages count instead of defaulting to 0.
- **How to test**:
  1. Have one account open in a browser where the chat page is **NOT** open. (If you have the chat page open anywhere, Stream automatically marks messages as read, causing a double-tick and clearing the notification).
  2. From a second account, send a message to the first account.
  3. Refresh or click around in the first account's dashboard (without going to the chat). You should see the notification bell display an unread count.

> **Note on Double Ticks**: You mentioned seeing a double-tick (read receipt) even without opening the chat. This happens because if you have the chat page open in any browser tab (even in the background), the Stream React SDK automatically marks the channel as read instantly. To test unread notifications properly, ensure the recipient account does NOT have the `/dashboard/messages` page open anywhere!
