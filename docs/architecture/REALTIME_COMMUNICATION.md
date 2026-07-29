# Real-Time Communication & Pub/Sub Architecture Guide

This document explains the concepts of pull-based vs. push-based communication, details the three common implementation mechanisms (Polling, Server-Sent Events, WebSockets) using traditional database architectures, and details the specific real-time architecture of the Influnet application along with the plan to resolve dynamic UI loading issues.

---

## 1. Core Concepts: Pull-Based vs. Push-Based

Traditional HTTP follows a **pull-based** model, whereas real-time applications require a **push-based** model.

```
Pull-Based (Standard HTTP)           Push-Based (Real-Time)
     Client              Server           Client              Server
       │                   │                │                   │
       │─── GET request ──>│                │─── Subscribe ────>│
       │<── HTTP Response ─│                │   (keep open)     │
       │                   │                │                   │
       │                   │                │<── Push Event ────│ (Data sent instantly
       │                   │                │<── Push Event ────│  when it changes on
                                                                   the backend)
```

1. **Pull-Based**: The client initiates all connections. The server cannot talk to the client unless the client requests it first.
2. **Push-Based**: The connection remains open. When an event occurs on the server or database, the server pushes the payload to the client immediately.

---

## 2. Three Real-Time Implementation Mechanisms

When building real-time features on traditional databases (e.g., PostgreSQL on Azure/GCP/AWS without Supabase), developers rely on three main patterns:

### Mechanism A: Polling (Periodic Pulling)
The client continuously asks the server for updates on a timer.

*   **How it works**:
    ```javascript
    // Client-side React interval
    useEffect(() => {
      const interval = setInterval(async () => {
        const res = await fetch('/api/notifications');
        const data = await res.json();
        setNotifications(data);
      }, 3000); // Polls every 3 seconds
      return () => clearInterval(interval);
    }, []);
    ```
*   **Drawbacks**: 
    *   Creates massive database load (constant empty queries).
    *   High latency (average 1.5-second delay before the user sees updates).
    *   Does not scale well under high concurrent user counts.

### Mechanism B: Server-Sent Events / SSE (Unidirectional Push)
A persistent, one-way connection from the server to the client. Ideal for notifications and activity feeds. It is native to all modern browsers via the `EventSource` API and automatically handles reconnection.

*   **PostgreSQL Trigger & LISTEN/NOTIFY Backend Pattern**:
    PostgreSQL has an in-memory Pub/Sub channel system using `LISTEN` and `NOTIFY`. This is completely free and works on standard PostgreSQL databases hosted anywhere.
    
    ```sql
    -- 1. Create a trigger function that broadcasts the insert details
    CREATE OR REPLACE FUNCTION notify_user_on_notification()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM pg_notify(
        'user_channel_' || replace(NEW.user_id::text, '-', '_'),
        json_build_object(
          'id', NEW.id,
          'type', NEW.type,
          'title', NEW.title,
          'body', NEW.body,
          'link', NEW.link
        )::text
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- 2. Attach trigger to your target table
    CREATE TRIGGER after_notification_insert
      AFTER INSERT ON notifications
      FOR EACH ROW EXECUTE FUNCTION notify_user_on_notification();
    ```

*   **Node.js Server Subscription Endpoint**:
    ```javascript
    app.get('/api/realtime-notifications', async (req, res) => {
      const userId = req.user.id;
      
      // Establish Server-Sent Events headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Connect a dedicated pg client to LISTEN to the channel
      const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
      await pgClient.connect();
      await pgClient.query(`LISTEN user_channel_${userId.replace(/-/g, '_')}`);

      pgClient.on('notification', (msg) => {
        res.write(`data: ${msg.payload}\n\n`); // Send event payload to client
      });

      // Keep-alive heartbeat every 20 seconds
      const keepAlive = setInterval(() => res.write(': heartbeat\n\n'), 20000);

      req.on('close', () => {
        clearInterval(keepAlive);
        pgClient.query(`UNLISTEN user_channel_${userId.replace(/-/g, '_')}`);
        pgClient.end();
      });
    });
    ```

*   **Client React Integration**:
    ```javascript
    useEffect(() => {
      const eventSource = new EventSource('/api/realtime-notifications');

      eventSource.onmessage = (event) => {
        const newNotif = JSON.parse(event.data);
        addNotification(newNotif);
        toast.success(newNotif.title);
      };

      return () => eventSource.close();
    }, []);
    ```

### Mechanism C: WebSockets (Bidirectional Communication)
A full-duplex persistent connection where both client and server can send data at any time. Essential for real-time chat, collaborative documents, or gaming.

*   **Node.js Server (e.g., using Socket.io)**:
    ```javascript
    const io = new Server(httpServer);

    io.on('connection', (socket) => {
      const userId = socket.handshake.auth.userId;
      socket.join(`user:${userId}`);

      socket.on('send_message', async (data) => {
        // 1. Write message to PostgreSQL
        await db.query('INSERT INTO messages ...');
        // 2. Push message to target recipient socket room
        io.to(`user:${data.recipientId}`).emit('new_message', data);
      });
    });
    ```

---

## 3. Influnet's Current Real-Time Architecture

The current architecture uses a hybrid approach:

1.  **Chat Channel (Stream Chat)**: Handles real-time messaging using a dedicated managed WebSocket service. 
2.  **Notification & Counter Channel (Supabase Realtime)**: Listens to the PostgreSQL `notifications` table over WebSockets. This is managed by Supabase CDC (Change Data Capture) and updates the unread badges dynamically in the background.

```
Influnet Real-Time Topology:

  [Stream Chat Server]  <== WebSocket (Messages) ==>  [Client Browser / Mobile App]
          ▲
          │ Webhook on new message
          ▼
    [Next.js API] ─── Write ───> [PostgreSQL] ─── CDC ───> [Supabase Realtime]
                                                                  │
                                                        WebSocket (Notifications)
                                                                  │
                                                                  ▼
                                                      [Client Shell component]
```

---

## 4. Current Problems & Solutions

### The Problem: UI Reload Lag
While chat messages arrive in real-time, other user event updates (such as collaboration requests or project status changes) do not update automatically on the corresponding list pages. The user must manually reload the page to see them.

*   **Gaps Identified**:
    1.  **Passive Shell Listener**: The Supabase Realtime channel in `shell.tsx` is only configured to update the unread bell count. It does not cascade updates to the current page state.
    2.  **No Subscription on Requests Page**: The `requests/page.tsx` page has no internal Postgres replication subscription, making it static once mounted.
    3.  **Realtime replication configuration**: The `collab_requests` database table does not have replication enabled in the Supabase management console.

### The Fix Plan

To make requests and project states update instantly without page reloads, implement the following steps:

#### Step 1: Enable Supabase Replication
Enable CDC updates for target tables in the Supabase Console:
*   Go to **Database** -> **Replication** -> **Source** -> Select `collab_requests` and `campaign_projects` and toggle them to **Enabled**.

#### Step 2: Add Realtime Subscription to the Requests Page
Update `apps/web/src/app/dashboard/requests/page.tsx` to listen to change events:

```typescript
useEffect(() => {
  const sb = createClient();
  const channel = sb
    .channel('requests-live-channel')
    .on(
      'postgres_changes',
      {
        event: '*', // Listen to INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'collab_requests',
        // Filter specifically to user-centric items
        filter: `to_user_id=eq.${userId}`,
      },
      () => {
        refreshRequests(); // Triggers page re-fetch
      }
    )
    .subscribe();

  return () => {
    sb.removeChannel(channel);
  };
}, [userId]);
```

#### Step 3: Implement In-App Banner Toasts
Wire up the `shell.tsx` notification subscription to display rich Sonner alerts dynamically when key event types arrive:

```typescript
// Inside Supabase Realtime subscription handler in shell.tsx:
(payload) => {
  const notif = payload.new as NotificationItem;
  addNotification(notif);
  
  if (notif.type === 'collab_request') {
    toast('New Collaboration Request', {
      description: notif.body,
      action: {
        label: 'View',
        onClick: () => router.push(notif.link || '/dashboard/requests'),
      },
      duration: 6000,
    });
  }
}
```
