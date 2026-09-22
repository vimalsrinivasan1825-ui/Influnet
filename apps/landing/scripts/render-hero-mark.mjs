// Renders the creator hero's Influnet mark to public/brand/hero-mark-line.webp
// (a plain white hairline) and public/brand/hero-mark-glow.webp (the pink outline
// with its glow), both on transparent backgrounds. The hero shows the line very
// faintly and reveals the glow only under the cursor.
//
// Why an image: the outline is an SVG filter (erode → edge → blur) over a shape
// 1100px+ wide. Run live it is far too heavy; rendered once, the hero only has
// to composite a texture.
//
// Geometry mirrors src/components/brand/logo-mark.tsx (NODES, ring, spokes). If
// the mark changes, change it here too and re-run:
//   node apps/landing/scripts/render-hero-mark.mjs
// Needs the root devDependency `playwright` and `sharp` (bundled with Next).
import { chromium } from 'playwright';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/brand');

const NODES = [
  { cx: 960, cy: 246, r: 87 },
  { cx: 525, cy: 396, r: 76 },
  { cx: 1013, cy: 617, r: 80 },
  { cx: 566, cy: 774, r: 84 },
];
const RING = { cx: 752, cy: 520 };
const RING_OUTER = 118;
// The image is the filter region, not just the mark, so the glow is not clipped.
const BOX = { x: 330, y: 50, w: 890, h: 920 };
const WIDTH_PX = 2000;
const HEIGHT_PX = Math.round((WIDTH_PX * BOX.h) / BOX.w);

const spokes = NODES.map((n) => {
  const dx = n.cx - RING.cx;
  const dy = n.cy - RING.cy;
  const len = Math.hypot(dx, dy);
  return `<line x1="${RING.cx + (dx / len) * RING_OUTER}" y1="${RING.cy + (dy / len) * RING_OUTER}" x2="${n.cx}" y2="${n.cy}" stroke-width="44" stroke-linecap="round" fill="none"/>`;
}).join('');
const nodes = NODES.map((n) => `<circle cx="${n.cx}" cy="${n.cy}" r="${n.r}" stroke="none"/>`).join('');

// Two versions of the same mark. `line`: the thinnest white edge, blurred, which
// the hero shows very faintly so the mark is there without competing with text.
// `glow`: a crisp pink hairline with its glow, revealed only under the cursor.
const VARIANTS = {
  // The thinnest edge the filter can draw, then softened, so at rest the mark is
  // a blurred haze of a line rather than a drawn outline.
  line: { color: '#ffffff', erode: 0.45, glow: '', soften: 2.2 },
  // Under the cursor: a crisp hairline with its glow.
  glow: {
    color: '#ff3aa8',
    erode: 0.55,
    glow: '<feGaussianBlur in="line" stdDeviation="4" result="glowNear"/><feGaussianBlur in="line" stdDeviation="14" result="glowFar"/>',
    soften: 0,
  },
};

const svgFor = (v) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}" width="${WIDTH_PX}" height="${HEIGHT_PX}">
  <defs>
    <filter id="o" filterUnits="userSpaceOnUse" x="${BOX.x}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}" color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha" operator="erode" radius="${v.erode}" result="inner"/>
      <feComposite in="SourceAlpha" in2="inner" operator="out" result="edge"/>
      <feFlood flood-color="${v.color}" result="tint"/>
      <feComposite in="tint" in2="edge" operator="in" result="${v.soften ? 'sharp' : 'line'}"/>
      ${v.soften ? `<feGaussianBlur in="sharp" stdDeviation="${v.soften}" result="line"/>` : ''}
      ${v.glow}
      <feMerge>${v.glow ? '<feMergeNode in="glowFar"/><feMergeNode in="glowNear"/>' : ''}<feMergeNode in="line"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#o)" stroke="#fff" fill="#fff">${spokes}${nodes}<circle cx="${RING.cx}" cy="${RING.cy}" r="96" stroke-width="44" fill="none"/></g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH_PX, height: HEIGHT_PX } });
for (const [name, v] of Object.entries(VARIANTS)) {
  await page.setContent(`<!doctype html><html style="background:transparent"><body style="margin:0;background:transparent">${svgFor(v)}</body></html>`);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: WIDTH_PX, height: HEIGHT_PX } });
  const out = path.join(DIR, `hero-mark-${name}.webp`);
  await sharp(png).webp({ quality: 84, alphaQuality: 92, effort: 6 }).toFile(out);
  const { size } = (await import('node:fs')).statSync(out);
  console.log(`wrote ${path.relative(process.cwd(), out)}  ${WIDTH_PX}×${HEIGHT_PX}  ${(size / 1024).toFixed(0)} KB`);
}
await browser.close();
console.log(`ring centre inside the image: ${(((RING.cx - BOX.x) / BOX.w) * 100).toFixed(2)}% × ${(((RING.cy - BOX.y) / BOX.h) * 100).toFixed(2)}%`);
