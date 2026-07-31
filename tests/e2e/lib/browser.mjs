// Shared Playwright interaction helpers. Unlike the old suite, every helper
// here throws a descriptive error when it can't find what it's looking for —
// callers (phase scripts) let that propagate into a FAILed step rather than
// logging a warning and silently moving on.
import { chromium } from 'playwright';
import { VIEWPORT } from './config.mjs';

export async function launchBrowser() {
  return chromium.launch({
    headless: !!process.env.CI,
    args: ['--window-size=1440,900'],
  });
}

export async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  return ctx.newPage();
}

/** Find an input/select/textarea by its associated <label> text, or by placeholder fallback. Throws if not found. */
export async function byLabel(page, labelText, fallbackPlaceholder) {
  const direct = page.locator(
    `xpath=//label[contains(normalize-space(text()),"${labelText}")]/following-sibling::*[self::input or self::select or self::textarea][1]`
  );
  if (await direct.count() > 0) return direct.first();

  const parentFinder = page.locator(
    `xpath=//label[contains(normalize-space(text()),"${labelText}")]/..//input | //label[contains(normalize-space(text()),"${labelText}")]/..//select | //label[contains(normalize-space(text()),"${labelText}")]/..//textarea`
  );
  if (await parentFinder.count() > 0) return parentFinder.first();

  if (fallbackPlaceholder) {
    const ph = page.locator(`input[placeholder*="${fallbackPlaceholder}"], textarea[placeholder*="${fallbackPlaceholder}"]`).first();
    if (await ph.count() > 0) return ph;
  }

  throw new Error(`byLabel: "${labelText}" not found (fallback placeholder: ${fallbackPlaceholder || 'none'})`);
}

export async function fillByLabel(page, labelText, value, fallbackPlaceholder) {
  const el = await byLabel(page, labelText, fallbackPlaceholder);
  await el.fill(value);
}

export async function selectOpt(page, labelText, value, fallbackPlaceholder) {
  const el = await byLabel(page, labelText, fallbackPlaceholder);
  await el.selectOption(value);
}

/** Click a button by exact/prefix text match. Throws if none found or all disabled. */
export async function clickButton(page, text) {
  const btns = page.locator('button').filter({ hasText: text });
  const count = await btns.count();
  for (let i = 0; i < count; i++) {
    const btn = btns.nth(i);
    if (await btn.isEnabled().catch(() => false)) {
      const btnText = (await btn.textContent().catch(() => '')).trim();
      if (btnText === text || btnText.startsWith(text) || btnText.includes(text)) {
        await btn.click();
        return;
      }
    }
  }
  if (count > 0) throw new Error(`clickButton: "${text}" found (${count}×) but all disabled`);
  throw new Error(`clickButton: "${text}" not found`);
}

export async function waitForSelector(page, selector, timeout = 8000) {
  await page.waitForSelector(selector, { timeout });
}

/** Poll until a button with this text is enabled, then click it. Throws with context if it never enables. */
export async function clickWhenEnabled(page, text, { timeout = 15000, interval = 400 } = {}) {
  const deadline = Date.now() + timeout;
  let lastSeenDisabled = false;
  while (Date.now() < deadline) {
    const btns = page.locator('button').filter({ hasText: text });
    const count = await btns.count();
    for (let i = 0; i < count; i++) {
      const btn = btns.nth(i);
      const btnText = (await btn.textContent().catch(() => '')).trim();
      if (btnText === text || btnText.startsWith(text) || btnText.includes(text)) {
        if (await btn.isEnabled().catch(() => false)) {
          await btn.click();
          return;
        }
        lastSeenDisabled = true;
      }
    }
    await page.waitForTimeout(interval);
  }
  throw new Error(`clickWhenEnabled: "${text}" never became enabled within ${timeout}ms${lastSeenDisabled ? ' (button present but stayed disabled — likely a still-pending async check)' : ' (button not found)'}`);
}
