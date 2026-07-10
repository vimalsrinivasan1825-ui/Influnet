# QA Testing Tracker

This file tracks the completed tasks and provides instructions on how to verify them. You can test these in the background while the agent continues working on the next steps.

---

## Task 1.1: Fix Stream Chat Authentication

**What was fixed:**
- Modified `/api/stream/token` and `/api/stream/channel` to authenticate using the user's active session instead of failing with a 401.
- Secured `/api/stream/channel` to prevent unauthorized users from creating chat channels for conversations they aren't part of.

**How to verify:**
1. Run the app locally (`npm run dev`) and log in.
2. Navigate to the **Messages** panel (`/dashboard/messages`).
3. Click on any active project/conversation in the sidebar to open the chat.
4. Open your browser's Developer Tools (Network tab).
5. Watch the requests to `/api/stream/token` and `/api/stream/channel` — they should now return `200 OK`.
6. The Stream Chat interface should fully load, allowing you to send a message.

---

## Task 1.2: Refactor Conversation API to use RPC

**What was fixed:**
- Modified `POST /api/conversations` (which creates a new conversation between two users) to use a Postgres RPC `get_or_create_conversation` instead of running raw SQL via the Supabase Management API.
- This secures the endpoint against SQL injection and ensures the database transaction is fully atomic.

**How to verify:**
1. Log into your dashboard (`npm run dev`).
2. Go to the **Messages** panel (`/dashboard/messages`).
3. Under "Active Projects" in the sidebar, click on a project that says "Start chat" next to a partner's name. (If none exist, you might need to create and accept a collab request first).
4. Verify that it instantly opens a new chat screen and the network request to `POST /api/conversations` returns `200 OK` (with the new conversation ID).

---
