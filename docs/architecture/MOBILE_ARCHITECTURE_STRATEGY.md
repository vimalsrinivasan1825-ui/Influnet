# Influnet — Mobile App Architecture Strategy

Adding a mobile app to an existing web platform is a huge milestone! Because you are already using a modern tech stack (Turborepo, Next.js, and Supabase), you are in a perfect position to do this efficiently. 

Here is exactly how your codebase will change, how the database works, and how you manage developing features for both platforms.

---

## 1. The Database: Do we use the same one?
**Yes, absolutely!** You will use the exact same Supabase database, authentication, and storage. 

A database doesn't care who is talking to it. Right now, your Next.js app acts as a "client" asking Supabase for data. When you build a mobile app, it simply becomes a **second client**. 
* If a user updates their profile picture on their iPhone, it saves to Supabase. 
* When they log in on their laptop 5 seconds later, the new picture is already there.

## 2. Codebase Structure: How will the monorepo change?
Right now, your codebase looks something like this:
```text
influnet/
├── apps/
│   ├── web/       (Next.js Web App)
│   └── landing/   (Static Landing Page)
```

To add mobile, you will add a new app (we highly recommend **React Native with Expo**):
```text
influnet/
├── apps/
│   ├── web/       
│   ├── landing/   
│   └── mobile/    <-- (NEW: React Native Expo App)
```

## 3. The "Secret Sauce": Code Sharing
You mentioned a major concern: *"if we are updating a particular feature, we need to work on the mobile app also. Right?"*

**Partially yes, but you don't have to rewrite everything!**

Because you are using a **Monorepo (Turborepo)**, you can extract your business logic out of the `web` app and put it into a shared `packages` folder. 

```text
influnet/
├── apps/
│   ├── web/       (UI: HTML/CSS/React)
│   └── mobile/    (UI: iOS/Android/React Native)
├── packages/
│   ├── ui/        (Shared colors, design tokens, maybe simple components)
│   ├── database/  (Supabase client, database types, SQL queries)
│   └── core/      (Matchmaking logic, price calculations, formatting rules)
```

**How this saves you time:**
If you need to change how the "Matchmaking Algorithm" calculates a score, you change it **once** in `packages/core`. Both the web app and the mobile app automatically inherit the new logic. 

**What you DO have to write twice (Feature Parity):**
You *will* have to build the **User Interface (UI)** twice. 
* In `apps/web`, you use `<div>`, `<span>`, and CSS.
* In `apps/mobile`, you use `<View>`, `<Text>`, and React Native StyleSheets.
Whenever you design a new page (like a new Chat screen), a developer will have to build the UI for the web, and then build the UI for mobile. 

## 4. Development Workflow & Planning
Since you haven't done this before, here is how you should plan your workflow:

### Phase 1: API & Package Extraction (Refactoring)
Before writing any mobile code, spend 1-2 weeks extracting your database calls and TypeScript interfaces from `apps/web` into the `packages/` folder. Ensure the web app still works perfectly using the newly shared packages.

### Phase 2: Mobile Scaffolding
Initialize the Expo app in `apps/mobile`. Set up navigation, authentication (Supabase Auth works great natively), and connect it to your shared packages.

### Phase 3: Parallel Development
Going forward, whenever a new feature is requested (e.g., "Add a tipping feature"):
1. Write the backend logic and database changes in `packages/`.
2. The Web Developer builds the Next.js UI.
3. The Mobile Developer builds the React Native UI.
4. They both use the exact same functions from the shared package to connect the UI to the database.

## Summary Recommendation
Do not use Flutter. Since your team already knows React and TypeScript for Next.js, use **React Native (specifically the Expo framework)**. It allows your developers to use the exact same language (JavaScript/React) and share up to 50-70% of the non-UI code between web and mobile!
