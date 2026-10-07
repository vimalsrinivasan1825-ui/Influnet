// Renders the Play Store phone screenshots (1080x1920) from src/*.png.
// To refresh with new app screens: replace the file in src/ (same name), then
//   node docs/operations/play-store/mockups/render.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, 'out');
fs.mkdirSync(out, { recursive: true });

const shots = [
  { img: '1-home.png', bg: 'pink', h: 'Know what needs<br>you <em>today</em>', s: 'Every deal, sorted by whose move it is.' },
  { img: '2-requests.png', bg: 'ink', h: 'Brand deals,<br><em>straight to you</em>', s: 'See the brief and the budget. Reply in chat or decline.' },
  { img: '3-projects.png', bg: 'pink', h: 'Every collab<br><em>in one place</em>', s: 'Track projects, deadlines and payments.' },
  { img: '4-project.png', bg: 'ink', full: 1, h: 'Nothing moves<br><em>without both of you</em>', s: 'Clear stages. Each side signs off before the next.' },
  { img: '5-messages.png', bg: 'pink', h: 'Talk terms<br><em>right in the app</em>', s: 'No more lost DMs, emails or screenshots.' },
  { img: '6-profile.png', bg: 'ink', full: 1, h: 'One link.<br><em>Your verified profile</em>', s: 'Followers, engagement and past work for your bio.' },
];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
for (const [i, s] of shots.entries()) {
  const q = new URLSearchParams(Object.entries(s).map(([k, v]) => [k, String(v)]));
  await page.goto(`file://${dir}/frame.html?${q}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getElementById('img').complete);
  const file = path.join(out, `${String(i + 1).padStart(2, '0')}-${s.img}`);
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
