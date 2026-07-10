# Agent Guidelines — Influnet Workspace

This file defines the core behavioral rules and instructions for coding agents working on the Influnet project.

---

## 1. Core Project Concept & Mission

Influnet is a premium influencer marketing platform matching brands/businesses and creators.

### Core Mission:
*   **Problem**: High latency in influencer communication (response times of several hours to days, or no response at all).
*   **Solution**: Instantly notify creators when a business sends a collaboration request, enabling conversations within minutes.
*   **The Link-in-Bio Model**: Creators place their custom Influnet profile link in their social bios. Businesses click it, submit requests, and initiate immediate collaborations.

### Core Architecture & User Flows (V1 Scope):
*   **Frontend & Backend**: Next.js (App Router) in [apps/web](file:///Users/macbook/Downloads/Library/PROJECTS/Influnet/apps/web) — a Turborepo monorepo workspace (`npm install` / `npm run dev` from the repo root). The old static marketing site was removed; see git tag `legacy-archive`.
*   **Database & Auth**: Supabase (PostgreSQL, Row Level Security, Supabase Auth).
*   **Aesthetic Guidelines**: Premium Apple-style light theme templates utilizing custom responsive SVGs and moderate border-radii (`rounded-2xl`).

### Core Business Flows:
1.  **Influencer Flow**: Register → Complete Profile → Set up custom profile link → Receive instant request notifications → Chat with brands.
2.  **Business Owner Flow**: Register → Search/Discover Creators → Send instant collaboration requests → Track analytics, spends, and pipeline status.
3.  **Interaction & Connections**: The message exchange, request pipelines, and active collaboration logs mapping brands to creators.
4.  **Dashboard Analytics**: Backend-computed metrics tracking active collaborations, conversion rates, and spends to render insights dynamically.

---

## 2. Mandatory Agent Workflow Rules

Every AI session must strictly adhere to the following execution loop:

### Step 1: Pre-Execution Context Load
*   **Always** read this file (`.agents/AGENTS.md`) and the lessons-learned tracker file [lessons_learned.md](file:///Users/macbook/Downloads/Library/PROJECTS/Influnet/.agents/lessons_learned.md) to understand current progress, state, and past issues.
*   **Active work order:** execute tasks from [EXECUTION_PLAN.md](file:///Users/macbook/Downloads/Library/PROJECTS/Influnet/.agents/EXECUTION_PLAN.md) in phase order (findings backing it: `docs/PROJECT_ANALYSIS.md`).

### Step 2: AST Code Graph Sync
*   After making any structural or functional modifications, **always** run:
    ```bash
    graphify update .
    ```
    to keep the codebase structure indexed.

### Step 3: Living Lessons-Learned Updates
*   Before ending your turn or concluding a feature development task, **you must update** [lessons_learned.md](file:///Users/macbook/Downloads/Library/PROJECTS/Influnet/.agents/lessons_learned.md) with:
    1.  **Scope**: What was built or modified.
    2.  **Broken & Resolved**: What broke, how you debugged it, and the final resolution.
    3.  **Key Lessons**: Technical lessons learned (styling rules, database tips, API gotchas).
    4.  **Next Target**: Future steps for V1 development.

---

## 3. Tech Stack Coding Rules

*   **Responsive Styling**: Avoid fixed dimensions where possible. Use flexbox and responsive grid areas to guarantee that layouts scale across screens.
*   **Tailwind Modifiers**: Utilize Tailwind overrides like `!text-white` when global stylesheets collide with card component text overrides.
*   **No Placeholders**: Never drop standard mock visual cards; draw beautiful, responsive SVG shapes or charts inline.
*   **Zero-Scroll Policy**: Dashboards must scale to fit exactly one viewport screen (`h-[calc(100vh-56px)] overflow-hidden`).

