// Generates the MangaRecs app icon/adaptive-icon/favicon/splash from the same
// 4-point sparkle mark used by components/StarLogo.js, so the in-app logo and
// the home-screen icon are the same design. Run: node scripts/generateStarIcon.js
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets');

// Same star polygon as StarLogo.js's viewBox="0 0 1024 1024" path, just as raw points
// for canvas path drawing instead of an SVG "d" string.
const STAR_POINTS = [
  [512, 70], [560, 444], [920, 512], [560, 580],
  [512, 954], [464, 580], [104, 512], [464, 444],
];

function scaledPoints(scale) {
  const cx = 512, cy = 512;
  return STAR_POINTS.map(([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale]);
}

function drawStarPath(ctx, scale) {
  const pts = scaledPoints(scale);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// Draws the star mark centered in a 1024x1024 canvas. `withBg` bakes in the
// dark background (for icon.png/favicon/splash); adaptive-icon leaves it
// transparent since Android composites its own backgroundColor from app.json.
function drawMark(ctx, { withBg }) {
  if (withBg) {
    const bg = ctx.createLinearGradient(0, 0, 1024, 1024);
    bg.addColorStop(0, '#0D0D0F');
    bg.addColorStop(1, '#13111A');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 1024);
  }

  // Outer soft glow field
  const outerGlow = ctx.createRadialGradient(512, 512, 0, 512, 512, 512);
  outerGlow.addColorStop(0, 'rgba(123,92,255,0.32)');
  outerGlow.addColorStop(0.6, 'rgba(80,48,208,0.12)');
  outerGlow.addColorStop(1, 'rgba(48,16,160,0)');
  ctx.fillStyle = outerGlow;
  ctx.beginPath(); ctx.ellipse(512, 512, 510, 510, 0, 0, Math.PI * 2); ctx.fill();

  // Ambient halo
  const halo = ctx.createRadialGradient(512, 495, 0, 512, 495, 350);
  halo.addColorStop(0, 'rgba(123,92,255,0.75)');
  halo.addColorStop(0.55, 'rgba(74,31,168,0.35)');
  halo.addColorStop(1, 'rgba(45,20,105,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.ellipse(512, 495, 350, 340, 0, 0, Math.PI * 2); ctx.fill();

  // Outer glow ring of the star
  ctx.fillStyle = 'rgba(124,58,255,0.35)';
  drawStarPath(ctx, 1.16); ctx.fill();

  // Inner glow ring
  ctx.fillStyle = 'rgba(139,80,255,0.58)';
  drawStarPath(ctx, 1.07); ctx.fill();

  // Main star
  const starGrad = ctx.createRadialGradient(512, 358, 0, 512, 358, 665);
  starGrad.addColorStop(0, '#FFFFFF');
  starGrad.addColorStop(0.3, '#F0E8FF');
  starGrad.addColorStop(0.65, '#C4A8FF');
  starGrad.addColorStop(1, '#9B70FF');
  ctx.fillStyle = starGrad;
  drawStarPath(ctx, 1); ctx.fill();

  // Center void + violet rim
  ctx.fillStyle = '#000000';
  ctx.beginPath(); ctx.arc(512, 512, 44, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(123,92,255,0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(512, 512, 44, 0, Math.PI * 2); ctx.stroke();
}

function renderPNG(size, { withBg, roundedBg = false, scale = 1 }) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.save();
  if (withBg && roundedBg) {
    const r = size * 0.2266;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(size, 0, size, size, r);
    ctx.arcTo(size, size, 0, size, r);
    ctx.arcTo(0, size, 0, 0, r);
    ctx.arcTo(0, 0, size, 0, r);
    ctx.closePath();
    ctx.clip();
  }
  ctx.translate(size / 2, size / 2);
  ctx.scale((size / 1024) * scale, (size / 1024) * scale);
  ctx.translate(-512, -512);
  drawMark(ctx, { withBg });
  ctx.restore();
  return canvas.toBuffer('image/png');
}

fs.writeFileSync(path.join(OUT, 'icon.png'), renderPNG(1024, { withBg: true, roundedBg: true }));
console.log('icon.png written');

fs.writeFileSync(path.join(OUT, 'adaptive-icon.png'), renderPNG(1024, { withBg: false, scale: 0.62 }));
console.log('adaptive-icon.png written (transparent, Android composites backgroundColor)');

fs.writeFileSync(path.join(OUT, 'favicon.png'), renderPNG(196, { withBg: true, roundedBg: false }));
console.log('favicon.png written');

fs.writeFileSync(path.join(OUT, 'splash-icon.png'), renderPNG(1024, { withBg: false, scale: 0.55 }));
console.log('splash-icon.png written (transparent, composited onto splash.backgroundColor)');
