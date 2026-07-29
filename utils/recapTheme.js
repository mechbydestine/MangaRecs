// ─────────────────────────────────────────────────────────────────────────
// MangaRecap — per-reader visual identity engine
//
// There is deliberately NO default MangaRecap theme. Every reader's palette is
// derived from the real dominant colours of the covers they actually read
// (AniList precomputes one per cover), so a One Piece / Kingdom / Vinland Saga
// reader physically cannot be handed the same purple a Solo Leveling reader
// gets. Genre only chooses TEXTURE (which manga print effect suits the
// reading), never hue — hue always comes from the reader's own shelf.
//
// The only place a constant colour appears is FALLBACK_SEEDS, used exclusively
// when a reader has zero resolvable covers (brand-new account). Even then the
// seed is picked from their favourite genre so two empty accounts with
// different tastes still diverge.
// ─────────────────────────────────────────────────────────────────────────

// ── colour maths ─────────────────────────────────────────────────────────

export function parseHex(hex) {
  let h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgba(hex, a) {
  const c = parseHex(hex);
  if (!c) return `rgba(10,8,18,${a})`;
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

function toHex({ r, g, b }) {
  const p = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

export function rgbToHsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
  else if (max === G) h = ((B - R) / d + 2) / 6;
  else h = ((R - G) / d + 4) / 6;
  return { h, s, l };
}

export function hslToHex({ h, s, l }) {
  const H = ((h % 1) + 1) % 1;
  if (s === 0) { const v = l * 255; return toHex({ r: v, g: v, b: v }); }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t0) => {
    let t = t0; if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return toHex({ r: f(H + 1 / 3) * 255, g: f(H) * 255, b: f(H - 1 / 3) * 255 });
}

function adjust(hex, { dh = 0, ds = 0, dl = 0, s: setS, l: setL } = {}) {
  const c = parseHex(hex);
  if (!c) return hex;
  const hsl = rgbToHsl(c);
  return hslToHex({
    h: hsl.h + dh,
    s: Math.max(0, Math.min(1, setS != null ? setS : hsl.s + ds)),
    l: Math.max(0, Math.min(1, setL != null ? setL : hsl.l + dl)),
  });
}

export function luminance(hex) {
  const c = parseHex(hex);
  if (!c) return 0;
  const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

// ── genre → texture (NOT colour) ─────────────────────────────────────────
// Which print-manga effect suits the reading. Hue never comes from here.
const GENRE_TEXTURE = {
  Action: 'speed', Sports: 'speed', 'Martial Arts': 'speed', Mecha: 'speed',
  Adventure: 'rays', Fantasy: 'rays', 'Sci-Fi': 'grid',
  Horror: 'ink', Thriller: 'ink', Mystery: 'ink', Psychological: 'ink',
  Romance: 'bokeh', 'Slice of Life': 'bokeh', Comedy: 'bokeh', Drama: 'bokeh',
  Supernatural: 'rays',
};

// Seeds used ONLY when a reader has no resolvable cover art at all. Keyed by
// their favourite genre so even two empty accounts diverge.
const FALLBACK_SEEDS = {
  Action: '#D93A2B', Adventure: '#E08A2C', Fantasy: '#7B4BD8', 'Sci-Fi': '#2B9FD9',
  Horror: '#7A1020', Romance: '#D9427F', Comedy: '#E0B22C', Drama: '#3F6FB5',
  Sports: '#1FA65A', Mystery: '#4A4470', Thriller: '#B03030', Supernatural: '#6A32B5',
  'Slice of Life': '#3FA88E', Psychological: '#55506E', Mecha: '#2F7FA8',
};

/**
 * Builds a reader's entire visual identity from the real dominant colours of
 * the covers they actually read.
 *
 * @param covers  [{ color }]  real AniList cover colours, most-read first
 * @param genre   their dominant genre (texture selection + fallback seed only)
 */
export function buildIdentity(covers, genre) {
  const seeds = (covers || [])
    .map((c) => c && c.color)
    .filter((c) => parseHex(c))
    // Ignore near-greyscale covers as the palette lead — they'd produce a
    // washed-out identity that looks like a bug rather than a design.
    .filter((c) => rgbToHsl(parseHex(c)).s > 0.12);

  const lead = seeds[0] || FALLBACK_SEEDS[genre] || '#B0362F';
  const second = seeds[1] || adjust(lead, { dh: 0.09, ds: 0.05 });
  const third = seeds[2] || adjust(lead, { dh: -0.11, ds: 0.05 });

  const leadHsl = rgbToHsl(parseHex(lead));
  // Push the lead to a usable "poster" chroma — real cover colours are often
  // muddy, and a recap wants saturated, printed-ink colour.
  const primary = adjust(lead, { s: Math.max(0.55, Math.min(0.92, leadHsl.s * 1.35)), l: 0.46 });
  const accent = adjust(second, { s: Math.max(0.62, Math.min(0.95, rgbToHsl(parseHex(second)).s * 1.4)), l: 0.58 });
  const alt = adjust(third, { s: Math.max(0.5, Math.min(0.9, rgbToHsl(parseHex(third)).s * 1.3)), l: 0.52 });

  return {
    primary,
    accent,
    alt,
    // Deep/ink ends of the reader's own hue — every dark slide is a shade of
    // THEIR colour, never a generic near-black.
    deep: adjust(primary, { s: 0.62, l: 0.13 }),
    abyss: adjust(primary, { s: 0.55, l: 0.06 }),
    // Warm paper stock tinted very slightly toward their hue.
    paper: adjust(primary, { s: 0.24, l: 0.92 }),
    paperDeep: adjust(primary, { s: 0.26, l: 0.8 }),
    paperInk: adjust(primary, { s: 0.5, l: 0.12 }),
    texture: GENRE_TEXTURE[genre] || 'speed',
    palette: [primary, accent, alt],
  };
}

/**
 * Per-slide surface derived from the reader's identity. `variant` shifts hue
 * and depth so all 10 slides feel like one designed set without any two
 * looking the same — and none of it is hardcoded to a brand colour.
 */
export function slideSurface(id, variant) {
  const V = {
    // deep colour slides — rotate around the reader's own hue
    deep0:  { from: adjust(id.primary, { s: 0.7, l: 0.20 }), to: id.abyss, light: false },
    deep1:  { from: adjust(id.primary, { dh: 0.05, s: 0.72, l: 0.24 }), to: adjust(id.primary, { dh: 0.05, s: 0.6, l: 0.07 }), light: false },
    deep2:  { from: adjust(id.accent, { dh: -0.04, s: 0.7, l: 0.22 }), to: adjust(id.accent, { s: 0.62, l: 0.06 }), light: false },
    deep3:  { from: adjust(id.alt, { s: 0.68, l: 0.23 }), to: adjust(id.alt, { s: 0.6, l: 0.07 }), light: false },
    night:  { from: adjust(id.primary, { dh: 0.52, s: 0.6, l: 0.18 }), to: adjust(id.primary, { dh: 0.52, s: 0.55, l: 0.05 }), light: false },
    fire:   { from: adjust(id.accent, { s: 0.86, l: 0.34 }), to: adjust(id.accent, { s: 0.75, l: 0.08 }), light: false },
    // paper slides — the light half of the rhythm
    paper0: { from: id.paper, to: id.paperDeep, light: true },
    paper1: { from: adjust(id.paper, { dh: 0.04 }), to: adjust(id.paperDeep, { dh: 0.04 }), light: true },
  };
  const s = V[variant] || V.deep0;
  return {
    from: s.from,
    to: s.to,
    light: s.light,
    ink: s.light ? id.paperInk : '#FFFFFF',
    dim: s.light ? rgba(id.paperInk, 0.68) : 'rgba(255,255,255,0.76)',
    accent: s.light ? adjust(id.primary, { s: 0.8, l: 0.4 }) : id.accent,
  };
}
