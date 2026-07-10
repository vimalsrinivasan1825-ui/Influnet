# QA & Testing Guide

This file tracks the recent fixes and refactoring efforts, along with step-by-step instructions on how to manually verify them on your end.

## Step 1: API Route Refactoring (withAuth & Zod)
**What was fixed:**
- We migrated the remaining core API routes to use the shared `withAuth` helper for Supabase authentication and added Zod schema validation for robust error handling.
- **Routes refactored:** 
  - `/api/collabs/[id]`
  - `/api/projects` and `/api/projects/[id]`
  - `/api/projects/[id]/cards` and `/api/projects/[id]/cards/[cardId]`
  - `/api/conversations` and `/api/conversations/[id]`
  - `/api/conversations/[id]/messages`

**How to check:**
1. **Collabs:** Send a collaboration request from a business account to an influencer, or vice versa. Ensure that the request is successfully created and appears in the collabs page.
2. **Projects:** Accept a collaboration request so it becomes a project. Check the Projects dashboard to ensure the project loads correctly. Try advancing the project stage (e.g., from "Collaboration Started" to "Project Discussion") and verify it saves.
3. **Project Cards:** In the project workspace, try adding a new kanban card, updating its title/description, moving it between stages, and deleting it. Ensure all actions persist on reload.
4. **Conversations:** Start a chat with the counterparty. Send a message and ensure it appears. Try loading the conversation history.

---
