# Influnet — Future Architectural Migrations & Prisma ORM Blueprint

This document outlines the migration paths for two major structural updates planned for the future:
1. **Splitting the unified Next.js app** into separate frontend and backend deployments.
2. **Migrating from Supabase** to a standard relational database (Azure SQL / MySQL) using the **Prisma ORM**.

---

## 1. Split Frontend & Backend Architecture

Currently, Next.js handles both UI layout pages (frontend) and API routes (backend) in a single monorepo app structure under `apps/web`.

### Deployment Split Models:
* **Option A: Virtual Split (Vercel Serverless + Cloud Host)**
  * Next.js stays as a unified codebase.
  * During deployment, Vercel hosts all frontend pages and automatically splits the API routes under `/api/*` into serverless edge/node functions.
* **Option B: Physical Split (Separate Microservices)**
  * You extract `apps/web/src/app/api/` into a standalone Node.js server (e.g., Express or NestJS) in a new package `apps/api`.
  * The frontend Next.js app communicates with this backend over HTTPS by pointing `NEXT_PUBLIC_API_URL` to the deployed server.

### Physical Split Action Plan:
1. **Backend Extraction:** Move business logic, schemas, and routes from `src/app/api/*` into an Express/Fastify server.
2. **CORS Configuration:** Configure CORS on the backend to accept incoming requests only from the frontend domain.
3. **Environment Injection:** Update the frontend to direct fetches via a centralized API wrapper referencing a configured endpoint:
   ```typescript
   const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
   ```

---

## 2. Migrating to Prisma ORM & Azure SQL / MySQL

Moving away from Supabase PostgreSQL requires replacing Supabase Client syntax with Prisma, rewriting Postgres-specific stored procedures, and migrating authentication.

### Step 1: Add Prisma ORM to the Project
Initialize Prisma inside the web app package:
```bash
cd apps/web
npm install @prisma/client
npm install prisma --save-dev
npx prisma init
```

### Step 2: Define Schema & Migrations
In the generated `prisma/schema.prisma` file, configure the connection string to target your Azure SQL or MySQL database, and translate the core tables (Profiles, Projects, Collab Requests, Cards) into Prisma syntax:

```prisma
datasource db {
  provider = "sqlserver" // or "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Profile {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  role      String   // 'business_owner' | 'influencer' | 'admin'
  phone     String?
  location  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  businessProfile   BusinessProfile?
  influencerProfile InfluencerProfile?
}
```

Deploy the schema using Prisma Migrations:
```bash
npx prisma migrate dev --name init
```

### Step 3: Replace Database Client Logic
Refactor `apps/web/src/lib/api.ts` or raw API routes to query database tables via Prisma Client instead of Supabase client:

```typescript
// BEFORE (Supabase):
const { data, error } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', userId);

// AFTER (Prisma):
const profile = await prisma.profile.findUnique({
  where: { id: userId },
});
```

### Step 4: Port Database PL/pgSQL Functions (RPCs)
Supabase utilizes Postgres database functions (RPCs) to perform atomic operations inside database transactions. When switching to Azure SQL or MySQL, you must rewrite these as standard TypeScript transactions inside your API routes.

#### Example: Accepting a Collaboration Request
```typescript
// BEFORE: calling supabase.rpc('accept_collab_request', { ... })

// AFTER (Prisma transaction in api/collabs/[id]/route.ts):
const result = await prisma.$transaction(async (tx) => {
  // 1. Update collaboration request status
  const collab = await tx.collabRequest.update({
    where: { id: collabId },
    data: { status: 'accepted' },
  });

  // 2. Create the project lifecycle record
  const project = await tx.campaignProject.create({
    data: {
      collabId,
      ownerId: collab.fromUserId,
      counterpartyId: collab.toUserId,
      stage: 'project_discussion',
    },
  });

  // 3. Create the chat thread conversation
  const conversation = await tx.conversation.create({
    data: { projectId: project.id },
  });

  return { project, conversation };
});
```

### Step 5: Replace Supabase Authentication
Since Supabase Auth is tightly coupled with its Postgres schemas, you will need to swap out the authentication layer:
* **Recommended Providers:** **Auth.js (NextAuth)**, **Clerk**, or **Kinde**.
* Replace `supabase.auth` handlers on login/signup screens with NextAuth endpoints, which sign secure HTTP-only cookies to persist user sessions.
