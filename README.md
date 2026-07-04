# Influnet — Local Development & Run Guide

This repository contains the Influnet web presence and application workspace, divided into the core Next.js web application and the Firebase static/legacy hosting directories.

---

## Workspace Structure

*   `influnet-app/` — **Next.js Application** containing the premium Apple-style authentication pages (login, creator/business signup) and the bento-grid business analytics dashboard.
*   `influnet/` — **Static site root** served by Firebase Hosting (Vite-built SPA landing page, media assets, and legacy redirects).
*   `firebase.json` — Firebase Hosting configurations.
*   `supabase/` — Database migration models and schema blueprints.

---

## 1. Running the Next.js Application (`influnet-app`)

The Next.js application hosts the dynamic user portal, auth screens, and dashboard layouts.

### Prerequisites
*   Node.js (v18 or higher recommended)
*   npm or pnpm

### Step-by-Step Local Run

1.  **Navigate into the application folder**:
    ```bash
    cd influnet-app
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Local Environment Setup**:
    Ensure you have a `.env.local` file inside `influnet-app/` with your Supabase credentials:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```

4.  **Launch the local development server**:
    ```bash
    npm run dev
    ```
    The Next.js app will be running at [http://localhost:3000](http://localhost:3000).

5.  **Compile production build (optional verification)**:
    To build the application and verify type-safety and route generation:
    ```bash
    npm run build
    ```

---

## 2. Serving the Landing Page (`influnet` & Firebase)

If you are working on the main marketing landing pages or testing Firebase deployment rules locally.

### Prerequisites
*   Firebase CLI installed globally (`npm install -g firebase-tools`)

### Step-by-Step Local Run

1.  **Login to Firebase** (first time only):
    ```bash
    firebase login
    ```

2.  **Start the local hosting emulator**:
    From the repository root directory:
    ```bash
    firebase emulators:start --only hosting
    ```
    The local static emulator environment will serve on [http://localhost:5000](http://localhost:5000).

3.  **Local build pipeline (Windows only)**:
    To compile the Vite SPA assets and sync them to the `influnet/` directory:
    ```powershell
    .\scripts\build-react-app.ps1
    ```

4.  **Deploying to Live Hosting**:
    ```bash
    firebase deploy --only hosting
    ```

---

## Troubleshooting & Verification

*   **Port conflict**: If port `3000` or `5000` is already in use, Next.js or Firebase will automatically prompt you to use an alternative port. Ensure old dev servers are terminated.
*   **Routing Issues**: If refreshing routes on the Firebase static deployment returns a `404`, check that rewrites are properly configured inside `firebase.json`.
*   **Database connection**: If login or signup steps fail, confirm the keys inside `influnet-app/.env.local` match your active Supabase project keys.
