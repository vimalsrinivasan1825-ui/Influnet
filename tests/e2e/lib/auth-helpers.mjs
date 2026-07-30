// Shared post-signup / login helpers used by both creator and business phases.
import { findAuthUserByEmail, confirmEmail } from './db.mjs';
import { clickButton } from './browser.mjs';

/**
 * After a signup submit, the app either logs the user in immediately
 * (session returned synchronously) or requires email confirmation and
 * redirects to /login. Handle both, returning which path was taken.
 */
export async function handlePostSignupAuth(page, { baseUrl, email, password }) {
  await page.waitForTimeout(2000);
  const onLogin = page.url().includes('/login');
  if (!onLogin) {
    return { method: 'auto-login', finalUrl: page.url() };
  }

  const user = await findAuthUserByEmail(email);
  if (!user) throw new Error(`handlePostSignupAuth: no auth user found for ${email} after signup submit`);
  await confirmEmail(user.id);

  await loginAs(page, { baseUrl, email, password });
  return { method: 'confirmed-then-manual-login', userId: user.id, finalUrl: page.url() };
}

export async function loginAs(page, { baseUrl, email, password }, attempt = 1) {
  await page.context().clearCookies();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input[type="email"], input[placeholder*="@"]', email);
  await page.fill('input[type="password"]', password);
  await clickButton(page, 'Sign in');
  await page.waitForTimeout(2500);
  if (page.url().includes('/login')) {
    // Rapid successive logins across phases can transiently hit Supabase
    // auth-endpoint rate limiting; retry a couple of times before failing.
    if (attempt < 3) {
      await page.waitForTimeout(2000 * attempt);
      return loginAs(page, { baseUrl, email, password }, attempt + 1);
    }
    throw new Error(`loginAs: still on /login after ${attempt} sign-in attempts for ${email}`);
  }
}
