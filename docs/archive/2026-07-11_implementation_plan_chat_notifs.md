# Chat & Notification Fixes Plan

## Overview
The goal is to fix two critical issues with the real-time chat functionality:
1. **Unread Message Notifications:** The dashboard and sidebar do not show real-time unread counts for messages. Currently, the backend API hardcodes `unread_messages_count: 0`, which constantly overwrites the UI state.
2. **Online/Offline Indicators:** The custom conversation list in the messages sidebar doesn't show whether the other party is online or offline, because it relies on standard database queries rather than Stream Chat's real-time presence engine.

## Open Questions
None. The issues stem from the fact that Stream Chat's real-time SDK state (which knows about unread counts and presence) is completely disconnected from the custom UI state that relies on the backend database. 

## Proposed Changes

### Global State & Notifications

#### [MODIFY] `apps/web/src/app/api/notifications/summary/route.ts`
- Remove the hardcoded `unreadMessages = 0`.
- Only return `unread_notifications_count` and `pending_requests_count`. This prevents the backend from stomping over the client-side Stream SDK unread count.

#### [MODIFY] `apps/web/src/store/notification-store.ts`
- Add an `updateSummary(partial: Partial<NotificationSummary>)` function.
- Change `setSummary` / `fetchSummary` consumers to use `updateSummary` so they merge values (e.g. updating general notifications doesn't erase the message unread count).

#### [MODIFY] `apps/web/src/components/dashboard/shell.tsx`
- In `initStream`, add an `updateStreamUnread()` function that reads `streamClient.user.total_unread_count`.
- Bind `updateStreamUnread` to Stream Chat events: `notification.message_new`, `notification.mark_read`, `message.new`, `message.read`, and also call it immediately after `connectUser`.

### Real-time Online Presence

#### [MODIFY] `apps/web/src/app/dashboard/messages/page.tsx`
- Add a new state: `const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({})`.
- Add a `useEffect` that runs once `streamClient` is connected and `conversations` are loaded.
- Use `streamClient.queryUsers({ id: { $in: otherUserIds } })` with `{ presence: true }` to fetch the initial online status of all chat partners.
- Subscribe to `streamClient.on('user.presence.changed', ...)` to update the `onlineUsers` state in real-time.
- Update the avatar renderer in the custom `conversations.map` loop to include a small green "online" dot (`bg-ok border-2 border-surface-card`) if `onlineUsers[otherUserId]` is true.

## Verification Plan

### Automated Tests
- Run `npm run build --workspace=web` to ensure no TypeScript or build errors are introduced by the state or Stream SDK changes.

### Manual Verification
- The user will log in as a business and see the real-time unread badge on the dashboard messages icon when an influencer sends a message.
- The user will see a green dot next to the creator's avatar in the messages sidebar when the creator is actively connected.
