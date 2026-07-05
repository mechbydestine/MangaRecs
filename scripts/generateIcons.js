const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// ── MangaRecs icon — manga panel grid forming a "P" on deep cyan-navy ──────────

function drawIcon(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const s = size / 1024; // scale factor

  // Background: deep navy with subtle cyan gradient
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#0D0D0F');
  bg.addColorStop(1, '#13131A');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Subtle cyan radial glow in center
  const glow = ctx.createRadialGradient(size * 0.5, size * 0.44, 0, size * 0.5, size * 0.44, size * 0.55);
  glow.addColorStop(0, 'rgba(8,145,178,0.22)');
  glow.addColorStop(1, 'rgba(8,145,178,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // ── Panel grid — 4 columns × 5 rows, covers center 70% of icon ──────────
  const PAD  = Math.round(160 * s);  // outer padding
  const GAP  = Math.round(14  * s);  // gap between panels
  const COLS = 4;
  const ROWS = 5;
  const W    = size - PAD * 2;
  const H    = size - PAD * 2;
  const cw   = (W - GAP * (COLS - 1)) / COLS;
  const rh   = (H - GAP * (ROWS - 1)) / ROWS;
  const rx   = Math.round(10 * s);  // panel corner radius

  // Which panels are "lit" (form a bold P shape):
  // Row 0: col 0,1,2,3  (top bar)
  // Row 1: col 0, col 3 (sides + right bump)
  // Row 2: col 0,1,2,3  (middle bar)
  // Row 3: col 0        (left stem only)
  // Row 4: col 0        (left stem only)
  const LIT = new Set([
    '0,0','0,1','0,2','0,3',
    '1,0',             '1,3',
    '2,0','2,1','2,2','2,3',
    '3,0',
    '4,0',
  ]);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const px = PAD + col * (cw + GAP);
      const py = PAD + row * (rh + GAP);
      const isLit = LIT.has(`${row},${col}`);

      if (isLit) {
        // Lit panel: cyan fill with inner glow
        const panelGrad = ctx.createLinearGradient(px, py, px + cw, py + rh);
        panelGrad.addColorStop(0, '#7F77DD');
        panelGrad.addColorStop(1, '#534AB7');
        ctx.fillStyle = panelGrad;
      } else {
        // Dark panel: very subtle so it reads as "empty" panel
        ctx.fillStyle = 'rgba(8,145,178,0.10)';
      }

      // Rounded rectangle
      ctx.beginPath();
      ctx.moveTo(px + rx, py);
      ctx.lineTo(px + cw - rx, py);
      ctx.quadraticCurveTo(px + cw, py, px + cw, py + rx);
      ctx.lineTo(px + cw, py + rh - rx);
      ctx.quadraticCurveTo(px + cw, py + rh, px + cw - rx, py + rh);
      ctx.lineTo(px + rx, py + rh);
      ctx.quadraticCurveTo(px, py + rh, px, py + rh - rx);
      ctx.lineTo(px, py + rx);
      ctx.quadraticCurveTo(px, py, px + rx, py);
      ctx.closePath();
      ctx.fill();

      // Thin border on all panels
      ctx.strokeStyle = isLit ? 'rgba(34,211,238,0.6)' : 'rgba(8,145,178,0.25)';
      ctx.lineWidth = Math.round(2 * s);
      ctx.stroke();
    }
  }

  // ── Subtle white sheen on the icon (top-left corner gloss) ───────────────
  const sheen = ctx.createRadialGradient(PAD, PAD, 0, PAD, PAD, size * 0.6);
  sheen.addColorStop(0, 'rgba(255,255,255,0.06)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);

  return c;
}

function drawSplash(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');

  // Background matching app
  ctx.fillStyle = '#0D0D0F';
  ctx.fillRect(0, 0, size, size);

  // Center the small icon version
  const iconSize = Math.round(size * 0.35);
  const iconOff  = (size - iconSize) / 2;

  // Draw a scaled-down version of the icon panels
  const s = iconSize / 1024;
  const PAD  = Math.round(160 * s);
  const GAP  = Math.round(14  * s);
  const COLS = 4;
  const ROWS = 5;
  const W    = iconSize - PAD * 2;
  const H    = iconSize - PAD * 2;
  const cw   = (W - GAP * (COLS - 1)) / COLS;
  const rh   = (H - GAP * (ROWS - 1)) / ROWS;
  const rx   = Math.round(10 * s);

  const LIT = new Set([
    '0,0','0,1','0,2','0,3',
    '1,0','1,3',
    '2,0','2,1','2,2','2,3',
    '3,0',
    '4,0',
  ]);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const px = iconOff + PAD + col * (cw + GAP);
      const py = iconOff + PAD + row * (rh + GAP);
      const isLit = LIT.has(`${row},${col}`);

      if (isLit) {
        const pg = ctx.createLinearGradient(px, py, px + cw, py + rh);
        pg.addColorStop(0, '#7F77DD');
        pg.addColorStop(1, '#534AB7');
        ctx.fillStyle = pg;
      } else {
        ctx.fillStyle = 'rgba(8,145,178,0.10)';
      }

      ctx.beginPath();
      ctx.moveTo(px + rx, py);
      ctx.lineTo(px + cw - rx, py);
      ctx.quadraticCurveTo(px + cw, py, px + cw, py + rx);
      ctx.lineTo(px + cw, py + rh - rx);
      ctx.quadraticCurveTo(px + cw, py + rh, px + cw - rx, py + rh);
      ctx.lineTo(px + rx, py + rh);
      ctx.quadraticCurveTo(px, py + rh, px, py + rh - rx);
      ctx.lineTo(px, py + rx);
      ctx.quadraticCurveTo(px, py, px + rx, py);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = isLit ? 'rgba(34,211,238,0.6)' : 'rgba(8,145,178,0.25)';
      ctx.lineWidth = Math.round(2 * s);
      ctx.stroke();
    }
  }

  return c;
}

const ASSETS = path.join(__dirname, '..', 'assets');

// Main icon (1024×1024)
const icon = drawIcon(1024);
fs.writeFileSync(path.join(ASSETS, 'icon.png'), icon.toBuffer('image/png'));
console.log('✓ icon.png');

// Adaptive icon foreground (1024×1024, centered on transparent)
const adaptive = drawIcon(1024);
fs.writeFileSync(path.join(ASSETS, 'adaptive-icon.png'), adaptive.toBuffer('image/png'));
console.log('✓ adaptive-icon.png');

// Splash icon (1024×1024, centered on dark bg)
const splash = drawSplash(1024);
fs.writeFileSync(path.join(ASSETS, 'splash-icon.png'), splash.toBuffer('image/png'));
console.log('✓ splash-icon.png');

// Favicon (64×64)
const favicon = drawIcon(64);
fs.writeFileSync(path.join(ASSETS, 'favicon.png'), favicon.toBuffer('image/png'));
console.log('✓ favicon.png');

console.log('\nAll MangaRecs icons generated.');
