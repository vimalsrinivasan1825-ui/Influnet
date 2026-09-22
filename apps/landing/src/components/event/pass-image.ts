import { NODES } from '@/components/brand/logo-mark';
import { EVENT, qrPath, type Pass } from './event';

// Draws the entry pass onto a canvas so it can be saved to the phone's gallery
// or shared. Mirrors the on-screen card in pass-card.tsx; drawn by hand rather
// than screenshotting the DOM so the output is identical on every browser.

const W = 1080;
const H = 1720;
const NIGHT = '#141118';
const BRAND = '#ff078e';
const SOFT = '#c9c1d1';

function fontVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  // Same geometry as <LogoMark>: viewBox 430 150 690 720.
  const s = size / 690;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(-430, -150);
  ctx.strokeStyle = BRAND;
  ctx.fillStyle = BRAND;
  ctx.lineWidth = 44;
  ctx.lineCap = 'round';
  for (const n of NODES) {
    const dx = n.cx - 752;
    const dy = n.cy - 520;
    const len = Math.hypot(dx, dy);
    ctx.beginPath();
    ctx.moveTo(752 + (dx / len) * 118, 520 + (dy / len) * 118);
    ctx.lineTo(n.cx, n.cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(n.cx, n.cy, n.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(752, 520, 96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, start: number, maxW: number) {
  let px = start;
  ctx.font = font(px);
  while (ctx.measureText(text).width > maxW && px > 40) {
    px -= 4;
    ctx.font = font(px);
  }
  return px;
}

export async function renderPassPng(pass: Pass): Promise<Blob> {
  await document.fonts?.ready;
  const display = fontVar('--font-bricolage', 'system-ui, sans-serif');
  const body = fontVar('--font-instrument', 'system-ui, sans-serif');
  const mono = fontVar('--font-spline-mono', 'ui-monospace, monospace');

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const pad = 80;

  // Ground + one soft glow behind the header.
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 60, 0, W * 0.85, 60, 700);
  glow.addColorStop(0, 'rgba(255,7,142,0.35)');
  glow.addColorStop(1, 'rgba(255,7,142,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 800);

  // Header: mark + wordmark, event label.
  drawLogo(ctx, pad, 84, 64);
  ctx.fillStyle = '#fff';
  ctx.font = `800 52px ${display}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('influnet', pad + 84, 118);
  ctx.textAlign = 'right';
  ctx.fillStyle = SOFT;
  ctx.font = `500 24px ${mono}`;
  ctx.fillText('[ ENTRY PASS ]', W - pad, 118);
  ctx.textAlign = 'left';

  // Event line.
  ctx.fillStyle = BRAND;
  ctx.font = `500 26px ${mono}`;
  ctx.fillText(`${EVENT.name.toUpperCase()} · SOFT LAUNCH`, pad, 250);

  // Welcome.
  const hello = `Welcome, ${pass.name.trim().split(/\s+/)[0]}`;
  const px = fitText(ctx, hello, (p) => `800 ${p}px ${display}`, 92, W - pad * 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(hello, pad, 250 + 40 + px / 2);
  ctx.fillStyle = SOFT;
  ctx.font = `400 34px ${body}`;
  ctx.fillText('We’re looking forward to seeing you.', pad, 250 + 60 + px + 20);

  // QR on a white tile.
  const tile = 560;
  const tx = (W - tile) / 2;
  const ty = 520;
  ctx.fillStyle = '#fff';
  roundRect(ctx, tx, ty, tile, tile, 36);
  ctx.fill();
  const { d, size } = qrPath(pass.passCode);
  const inner = tile - 80;
  ctx.save();
  ctx.translate(tx + 40, ty + 40);
  ctx.scale(inner / size, inner / size);
  ctx.fillStyle = NIGHT;
  ctx.fill(new Path2D(d));
  ctx.restore();

  // Code.
  ctx.textAlign = 'center';
  ctx.fillStyle = SOFT;
  ctx.font = `500 24px ${mono}`;
  ctx.fillText('YOUR CODE', W / 2, ty + tile + 70);
  ctx.fillStyle = '#fff';
  ctx.font = `600 84px ${mono}`;
  ctx.fillText(pass.passCode, W / 2, ty + tile + 140);
  ctx.textAlign = 'left';

  // Perforation.
  const py = 1340;
  ctx.fillStyle = '#fbfaf8';
  ctx.beginPath();
  ctx.arc(0, py, 34, 0, Math.PI * 2);
  ctx.arc(W, py, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(201,193,209,0.35)';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 14]);
  ctx.beginPath();
  ctx.moveTo(60, py);
  ctx.lineTo(W - 60, py);
  ctx.stroke();
  ctx.setLineDash([]);

  // Details.
  const cols: [string, string, string][] = [
    ['DATE', EVENT.dateShort, '2026'],
    ['TIME', '3 – 6 PM', 'IST'],
    ['VENUE', 'StartupTN', EVENT.city],
  ];
  const colW = (W - pad * 2) / 3;
  cols.forEach(([label, a, b], i) => {
    const x = pad + colW * i;
    ctx.fillStyle = SOFT;
    ctx.font = `500 22px ${mono}`;
    ctx.fillText(label, x, py + 80);
    ctx.fillStyle = '#fff';
    ctx.font = `700 38px ${display}`;
    ctx.fillText(a, x, py + 140);
    ctx.fillStyle = SOFT;
    ctx.font = `400 30px ${body}`;
    ctx.fillText(b, x, py + 190);
  });

  ctx.fillStyle = 'rgba(201,193,209,0.7)';
  ctx.font = `400 26px ${body}`;
  ctx.textAlign = 'center';
  ctx.fillText('Show this pass at the entrance · influnet.io', W / 2, H - 70);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}
