# Android App Distribution & Internal Testing Runbook

This guide covers building, signing, and releasing the Influnet Android application using Expo Application Services (EAS) and Google Play Console.

---

## 1. Distribution Tracks Overview

Google Play Console provides several testing tracks. We use **Internal Testing** as the starting point:

| Track | Max Users | Google Review Required? | Availability | Purpose |
|---|---|---|---|---|
| **Internal Testing** | 100 | **No** | Within minutes | Rapid iteration, QA, internal client review. |
| **Closed Testing** | Varies | **Yes** (initial build) | Days (initial) / Hours (subsequent) | Formal alpha/beta with invited groups. |
| **Open Testing** | Unlimited | **Yes** | Days | Public beta. |
| **Production** | Unlimited | **Yes** | Days | Live release to everyone on Google Play. |

---

## 2. Step-by-Step Distribution Process

### Step 2.1: Build the Android App Bundle (`.aab`)
Google Play Store requires app uploads in the `.aab` format (Android App Bundle).

1. In your terminal, navigate to the mobile app directory:
   ```bash
   cd apps/mobile
   ```
2. Run the EAS build command using the production profile:
   ```bash
   eas build --platform android --profile production
   ```
3. **EAS Credentials Setup**:
   - If prompted to log in to your Expo account, log in.
   - If asked: *"Would you like us to generate a new Android Keystore?"*, select **Yes**. Expo will automatically generate and manage the cryptographic keys required to sign your app.
4. When the build completes on Expo's remote servers, download the resulting `.aab` file from the printed Expo build dashboard URL.

### Step 2.2: Set Up the App in Google Play Console
1. Log in to your [Google Play Console](https://play.google.com/console/).
2. Click the **Create app** button in the top right.
3. Complete the app registration details:
   - **App name**: `Influnet`
   - **Default language**: `English (United States)`
   - **App or game**: `App`
   - **Free or paid**: `Free` (Note: Changing a free app to a paid app later is heavily restricted by Google).
4. Check the declarations for **Developer Program Policies** and **US export laws**.
5. Click **Create app** at the bottom of the page.

### Step 2.3: Set Up App Signing and Upload the Build
1. In the left-hand menu, scroll to the **Testing** section and click **Internal testing**.
2. Click **Create new release** in the top right.
3. If prompted to enroll in **Play App Signing**, click **Continue** (accepting Google-managed keys is mandatory for `.aab` uploads).
4. Drag and drop the downloaded `.aab` file from Step 2.1 into the **App bundles** upload area.
5. Provide a short description of the update under **Release notes**.
6. Click **Next** (Save and Review release).
7. Review any warnings, then click **Save** or **Start rollout to Internal testing**.

### Step 2.4: Invite and Onboard Testers
1. Go back to the **Internal testing** page and click the **Testers** tab.
2. Under **Email lists**, click **Create email list**.
3. Name your list (e.g., *"Influnet Internal Testers"*), type in the Gmail addresses of your testers, and click **Save**.
4. Check the box next to your new email list to enable it for this track.
5. Save the page changes.
6. Scroll down to the **How testers join your test** section.
7. Copy the **join link** (web URL) and send it to your testers.

---

## 3. How Testers Join (On Their Phones)

Unlike iOS TestFlight, Android test users must opt-in via a web link before they can download:
1. The tester opens the **join link** on their Android phone while logged into their invited Gmail account.
2. They must click **Become a tester / Accept invitation**.
3. The page will redirect them to a **"Download it on Google Play"** link.
4. Tapping that opens the Google Play Store app directly on their device, where they can install the private app.

---

## 4. Crucial Android Policy: The 20-Tester Rule

If your Google Play Developer Account is a **personal developer account** registered after **November 9, 2023**, you are subject to Google's testing mandate before you can publish to Production:

- **The Rule**: You must run a Closed Test with at least **20 testers** who must be opted-in and test the app **continuously for at least 14 days** before you can apply for Production access.
- **The Workaround**: This rule **does not** apply to Internal Testing. You can use Internal Testing with up to 100 testers immediately without any time limits or minimum numbers. Use Internal Testing for daily development and client feedback, and only set up the 20-tester track when you are ready to prepare for the public launch.
