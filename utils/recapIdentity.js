// ─────────────────────────────────────────────────────────────────────────
// MangaRecap — per-reader visual identity engine
//
// There is no MangaRecap theme. There are only readers.
//
// Three INDEPENDENT axes are derived from real reading history, and together
// they decide what the recap physically looks like:
//
//   1. PRINT MODE  ← where the reader's stories come from (countryOfOrigin,
//                    weighted by chapters read). This picks the whole design
//                    LANGUAGE, not a colour: newsprint-and-screentone for a
//                    manga reader, full-colour vertical-scroll glow for a
//                    manhwa reader, rice-paper and sumi ink for a manhua
//                    reader, hard editorial geometry for someone who reads
//                    across all three.
//
//   2. PALETTE     ← the real dominant cover colours of what they read, hue-
//                    bucketed and weighted by chapter count. Not "their top
//                    series' colour" — the centre of mass of their shelf.
//
//   3. TEXTURE     ← their dominant genre lane picks which print effect runs
//                    over the top. Never a hue.
//
// So a One Piece / Kingdom / Vinland Saga reader gets print mode, warm ink-red
// spot colour and speed lines. A Solo Leveling / TBATE / ORV reader gets
// webtoon mode — saturated, glowing, rounded, zero paper texture — and cannot
// receive parchment even by accident, because parchment does not exist in
// their mode's surface table. A Blue Lock / Ao Ashi reader gets print mode
// with a cold pitch-blue palette and hard motion lines.
//
// The only constants in this file are FALLBACK_SEEDS, reached solely when a
// reader has zero resolvable cover art, and even then the seed is chosen from
// their favourite genre so two empty accounts still diverge.
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
  const S = Math.max(0, Math.min(1, s));
  const L = Math.max(0, Math.min(1, l));
  if (S === 0) { const v = L * 255; return toHex({ r: v, g: v, b: v }); }
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
  const p = 2 * L - q;
  const f = (t0) => {
    let t = t0; if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return toHex({ r: f(H + 1 / 3) * 255, g: f(H) * 255, b: f(H - 1 / 3) * 255 });
}

/** Shift a colour in HSL space. `s`/`l` set absolutely, `ds`/`dl`/`dh` relatively. */
export function adjust(hex, { dh = 0, ds = 0, dl = 0, s: setS, l: setL } = {}) {
  const c = parseHex(hex);
  if (!c) return hex;
  const hsl = rgbToHsl(c);
  return hslToHex({
    h: hsl.h + dh,
    s: setS != null ? setS : hsl.s + ds,
    l: setL != null ? setL : hsl.l + dl,
  });
}

export function mix(a, b, t) {
  const A = parseHex(a), B = parseHex(b);
  if (!A || !B) return a;
  return toHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
}

export function luminance(hex) {
  const c = parseHex(hex);
  if (!c) return 0;
  const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Nudge `c` (lightness only, hue preserved) until it clears `min` contrast
 * against `bg`. Used so an accent pulled from a reader's cover art is always
 * legible on their own surface instead of vanishing into it.
 */
export function legible(c, bg, min = 4.2) {
  const up = luminance(bg) < 0.35;
  let out = c;
  for (let i = 0; i < 22 && contrast(out, bg) < min; i++) {
    out = adjust(out, { dl: up ? 0.035 : -0.035 });
  }
  return out;
}

// ── genre lane → texture + narrative voice (never hue) ────────────────────

const LANES = [
  { key: 'battle',   texture: 'speed',   match: ['Action', 'Martial Arts', 'Mecha'],                    label: 'Battle' },
  { key: 'pitch',    texture: 'speed',   match: ['Sports'],                                             label: 'Sports' },
  { key: 'quest',    texture: 'rays',    match: ['Adventure', 'Fantasy'],                               label: 'Adventure' },
  { key: 'dread',    texture: 'ink',     match: ['Horror', 'Thriller', 'Mystery', 'Psychological'],     label: 'Suspense' },
  { key: 'heart',    texture: 'bokeh',   match: ['Romance', 'Drama'],                                   label: 'Drama' },
  { key: 'calm',     texture: 'bokeh',   match: ['Slice of Life', 'Comedy', 'Music'],                   label: 'Slice of Life' },
  { key: 'circuit',  texture: 'grid',    match: ['Sci-Fi'],                                             label: 'Sci-Fi' },
  { key: 'occult',   texture: 'rays',    match: ['Supernatural'],                                       label: 'Supernatural' },
];

// Reached only when a reader has no resolvable cover art at all. Keyed by
// favourite genre so even two brand-new accounts diverge.
const FALLBACK_SEEDS = {
  Action: '#C6362B', Adventure: '#D98428', Fantasy: '#6E45C9', 'Sci-Fi': '#2589C2',
  Horror: '#6E1220', Romance: '#CE3C74', Comedy: '#D4A727', Drama: '#3A67AA',
  Sports: '#1B9A54', Mystery: '#443F68', Thriller: '#A32C2C', Supernatural: '#5F2CA6',
  'Slice of Life': '#37997F', Psychological: '#4D4966', Mecha: '#2A7398',
  'Martial Arts': '#B24A1E', Music: '#B0407F',
};

// ── print modes ──────────────────────────────────────────────────────────
// The design LANGUAGE. Colour never comes from here — only structure,
// texture and the shape vocabulary.

export const MODES = {
  // Weekly shounen print: newsprint stock, heavy screentone, hard gutters,
  // one screaming spot colour.
  print: {
    key: 'print',
    label: 'Shonen Print',
    rail: '漫画',
    radius: 2,
    border: 3,
    tone: 'screentone',
    warmWhite: '#F7F2E6',
    gutter: true,
    tilt: 2.2,
    lift: 0,
    grain: 0.075,
    // black-and-white bones, colour used as ink accents
    chroma: 0.72,
  },
  // Vertical-scroll full colour: no paper anywhere, rim light, soft rounded
  // panels, glow instead of dots.
  webtoon: {
    key: 'webtoon',
    label: 'Vertical Scroll',
    rail: '웹툰',
    radius: 22,
    border: 1.5,
    tone: 'glow',
    warmWhite: '#FFFFFF',
    gutter: false,
    tilt: 0,
    lift: 26,
    grain: 0.03,
    chroma: 1,
  },
  // Sumi-e: rice paper, brush strokes, seal stamps, wash gradients.
  inkwash: {
    key: 'inkwash',
    label: 'Ink & Brush',
    rail: '漫畫',
    radius: 6,
    border: 2,
    tone: 'wash',
    warmWhite: '#F6EFE2',
    gutter: false,
    tilt: 1.2,
    lift: 6,
    grain: 0.09,
    chroma: 0.8,
  },
  // Reads across all three origins — hard editorial geometry, chromatic
  // misregistration, colour blocks with zero radius.
  neo: {
    key: 'neo',
    label: 'Neo Editorial',
    rail: '記録',
    radius: 0,
    border: 4,
    tone: 'block',
    warmWhite: '#FFFFFF',
    gutter: true,
    tilt: 3.4,
    lift: 0,
    grain: 0.05,
    chroma: 1,
  },
};

const MODE_BY_COUNTRY = { JP: 'print', KR: 'webtoon', CN: 'inkwash', TW: 'inkwash', HK: 'inkwash' };

// ── palette extraction ───────────────────────────────────────────────────

/**
 * Circular-weighted hue clustering. Each cover contributes its real dominant
 * colour with a weight equal to how much of it the reader actually read, so
 * the palette is the centre of mass of a shelf rather than whatever happened
 * to sort first.
 */
function clusterHues(seeds) {
  const BINS = 14;
  const bins = Array.from({ length: BINS }, () => ({ w: 0, sx: 0, sy: 0, s: 0, l: 0 }));

  seeds.forEach(({ hex, weight }) => {
    const rgb = parseHex(hex);
    if (!rgb) return;
    const { h, s, l } = rgbToHsl(rgb);
    // Near-greyscale and near-black covers describe printing, not taste.
    if (s < 0.12 || l < 0.07 || l > 0.94) return;
    const b = Math.min(BINS - 1, Math.floor(h * BINS));
    const a = h * Math.PI * 2;
    bins[b].w += weight;
    bins[b].sx += Math.cos(a) * weight;
    bins[b].sy += Math.sin(a) * weight;
    bins[b].s += s * weight;
    bins[b].l += l * weight;
  });

  return bins
    .map((b, i) => (b.w > 0 ? {
      i,
      w: b.w,
      h: ((Math.atan2(b.sy, b.sx) / (Math.PI * 2)) % 1 + 1) % 1,
      s: b.s / b.w,
      l: b.l / b.w,
    } : null))
    .filter(Boolean)
    .sort((a, b) => b.w - a.w);
}

/** Pick the strongest cluster that sits at least `gap` bins from those taken. */
function distinct(clusters, taken, gap = 3) {
  const BINS = 14;
  for (const c of clusters) {
    const far = taken.every((t) => {
      const d = Math.abs(c.i - t);
      return Math.min(d, BINS - d) >= gap;
    });
    if (far) return c;
  }
  return null;
}

/**
 * @param seeds   [{ color, weight, country }] real cover colours + chapters read
 * @param signals { genre, genres, peakHour }
 */
export function buildIdentity(seeds = [], signals = {}) {
  const list = (seeds || []).filter((s) => s && parseHex(s.color));

  // ── axis 1: print mode, from where their stories are drawn ──────────────
  const byCountry = {};
  list.forEach((s) => {
    const c = s.country || 'JP';
    byCountry[c] = (byCountry[c] || 0) + Math.max(1, s.weight || 1);
  });
  const totalW = Object.values(byCountry).reduce((a, b) => a + b, 0);
  const ranked = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
  const leadCountry = ranked[0]?.[0] || null;
  const leadShare = totalW ? (ranked[0]?.[1] || 0) / totalW : 0;
  // A clear majority earns that origin's design language; a genuinely mixed
  // reader gets the editorial mode built for exactly that.
  const modeKey = (leadShare >= 0.55 && MODE_BY_COUNTRY[leadCountry]) || 'neo';
  const mode = MODES[modeKey];

  // ── axis 2: palette, from their real cover colours ──────────────────────
  const clusters = clusterHues(list.map((s) => ({ hex: s.color, weight: Math.max(1, s.weight || 1) })));

  const genre = signals.genre;
  const fallback = FALLBACK_SEEDS[genre] || FALLBACK_SEEDS[(signals.genres || [])[0]] || '#B0362F';

  let primary, accent, alt;
  if (clusters.length) {
    const c1 = clusters[0];
    // Prefer a genuinely separate hue the reader actually reads. Only when a
    // shelf is effectively single-hue (every One Piece / Kingdom / Vinland
    // cover is warm) do we synthesise, and then only far enough to read as a
    // second colour — a wide shift would invent a lime green nobody's shelf
    // contains and the palette would stop being theirs.
    const c2 = distinct(clusters, [c1.i], 2) || { h: c1.h + 0.055, s: c1.s * 0.95, l: c1.l };
    const c3 = distinct(clusters, [c1.i, c2.i ?? c1.i], 2) || { h: c1.h - 0.085, s: c1.s * 0.85, l: c1.l };
    // Real cover colours skew muddy; a recap wants printed-ink chroma.
    primary = hslToHex({ h: c1.h, s: Math.max(0.52, Math.min(0.9, c1.s * 1.3)), l: 0.47 });
    accent  = hslToHex({ h: c2.h, s: Math.max(0.58, Math.min(0.9, c2.s * 1.3)), l: 0.6 });
    alt     = hslToHex({ h: c3.h, s: Math.max(0.48, Math.min(0.84, c3.s * 1.2)), l: 0.53 });
  } else {
    primary = adjust(fallback, { l: 0.47 });
    accent  = adjust(fallback, { dh: 0.1, l: 0.6 });
    alt     = adjust(fallback, { dh: -0.13, l: 0.53 });
  }

  // Webtoon mode lives on emissive colour; print mode lives on ink. Same
  // reader hue, physically different material.
  if (modeKey === 'webtoon') {
    primary = adjust(primary, { ds: 0.06, dl: 0.03 });
    accent = adjust(accent, { ds: 0.1, dl: 0.08 });
  } else if (modeKey === 'print') {
    primary = adjust(primary, { ds: 0.08, dl: -0.03 });
  } else if (modeKey === 'inkwash') {
    primary = adjust(primary, { ds: -0.1, dl: -0.05 });
    alt = adjust(alt, { ds: -0.14 });
  }

  // ── axis 3: texture, from the genre lane ────────────────────────────────
  const genrePool = new Set([genre, ...(signals.genres || [])].filter(Boolean));
  const lane = LANES.find((l) => l.match.some((m) => genrePool.has(m))) || LANES[2];

  const deep   = adjust(primary, { s: modeKey === 'webtoon' ? 0.68 : 0.55, l: modeKey === 'webtoon' ? 0.16 : 0.12 });
  const abyss  = adjust(primary, { s: modeKey === 'webtoon' ? 0.6 : 0.45, l: 0.055 });
  const paper  = modeKey === 'inkwash'
    ? adjust(primary, { s: 0.16, l: 0.925 })
    : adjust(primary, { s: 0.1, l: 0.945 });
  const paperDeep = adjust(paper, { ds: 0.06, dl: -0.13 });
  const paperInk  = adjust(primary, { s: 0.55, l: 0.11 });

  return {
    mode,
    modeKey,
    lane: lane.key,
    laneLabel: lane.label,
    texture: lane.texture,
    origin: leadCountry,
    originShare: leadShare,

    primary,
    accent,
    alt,
    deep,
    abyss,
    paper,
    paperDeep,
    paperInk,
    warmWhite: mode.warmWhite,

    // Ramp used by genre bars, the orbit wheel and confetti — five stops that
    // travel between the reader's own three colours instead of a rainbow.
    ramp: [
      primary,
      mix(primary, accent, 0.5),
      accent,
      mix(accent, alt, 0.5),
      alt,
    ],
    palette: [primary, accent, alt],
  };
}

// ── per-slide surfaces ───────────────────────────────────────────────────
// Each mode owns a different sequence of surface TONES across the ten slides,
// so the rhythm of light and dark is itself personalised. A print reader gets
// the ink/newsprint alternation of a printed volume; a webtoon reader never
// touches paper at all.

const TONE_SEQ = {
  print:   ['ink',   'paper', 'ink',  'night', 'ink',  'paper', 'spot', 'ink',  'fire', 'ink'],
  webtoon: ['deep',  'lume',  'deep', 'night', 'deep', 'lume',  'spot', 'deep', 'fire', 'deep'],
  inkwash: ['ink',   'paper', 'wash', 'night', 'ink',  'paper', 'spot', 'wash', 'fire', 'ink'],
  neo:     ['block', 'white', 'block','night', 'block','white', 'spot', 'block','fire', 'block'],
};

// How much each slide is allowed to dim its own cover art. Hero slides breathe;
// text-dense slides pull the veil up so type stays readable.
const VEIL = [0.42, 0.5, 0.46, 0.5, 0.34, 0.56, 0.52, 0.48, 0.5, 0.3];

function tone(id, name, i) {
  const drift = i * 0.011; // each slide walks a little further around their hue
  switch (name) {
    case 'ink':
      return { from: adjust(id.deep, { dh: drift, dl: 0.055 }), to: adjust(id.abyss, { dh: drift }), light: false };
    case 'deep':
      return { from: adjust(id.deep, { dh: drift, ds: 0.08, dl: 0.09 }), to: adjust(id.abyss, { dh: drift, ds: 0.05 }), light: false };
    case 'wash':
      return { from: adjust(id.deep, { dh: drift, ds: -0.18, dl: 0.1 }), to: adjust(id.abyss, { ds: -0.1 }), light: false };
    case 'block':
      return { from: adjust(id.primary, { s: 0.2, l: 0.1 }), to: '#07070A', light: false };
    case 'night':
      // The hour they actually read decides how cold this gets.
      return { from: adjust(id.primary, { dh: 0.48, s: 0.5, l: 0.17 }), to: adjust(id.primary, { dh: 0.5, s: 0.45, l: 0.045 }), light: false };
    case 'spot':
      return { from: adjust(id.accent, { s: 0.78, l: 0.33 }), to: adjust(id.accent, { s: 0.66, l: 0.09 }), light: false };
    case 'fire':
      return { from: adjust(id.accent, { s: 0.9, l: 0.42 }), to: adjust(id.accent, { s: 0.8, l: 0.08 }), light: false };
    case 'paper':
      return { from: adjust(id.paper, { dh: drift }), to: adjust(id.paperDeep, { dh: drift }), light: true };
    case 'lume':
      // Webtoon's light slide is never paper — it is a lit colour field.
      return { from: adjust(id.accent, { s: 0.42, l: 0.9 }), to: adjust(id.primary, { s: 0.46, l: 0.72 }), light: true };
    case 'white':
      return { from: '#FFFFFF', to: adjust(id.primary, { s: 0.1, l: 0.88 }), light: true };
    default:
      return { from: id.deep, to: id.abyss, light: false };
  }
}

/**
 * The full surface contract a slide paints against. Everything a slide needs
 * to style itself lives here so no slide ever reaches for a literal colour.
 */
export function surfaceFor(id, i) {
  const seq = TONE_SEQ[id.modeKey] || TONE_SEQ.neo;
  const name = seq[i % seq.length];
  const t = tone(id, name, i);
  const m = id.mode;

  const ink = t.light ? id.paperInk : (m.key === 'webtoon' || m.key === 'neo' ? '#FFFFFF' : id.warmWhite);
  const bg = t.light ? t.from : t.to;

  // Accent is re-derived per surface so it always clears contrast on the
  // surface it actually lands on — a pale cover colour cannot go invisible
  // on newsprint, and a dark one cannot disappear into ink.
  const rawAccent = name === 'spot' || name === 'fire'
    ? (t.light ? id.primary : id.warmWhite)
    : id.accent;
  const accent = legible(t.light ? adjust(rawAccent, { dl: -0.12 }) : rawAccent, bg, t.light ? 4.4 : 3.4);

  return {
    key: name,
    from: t.from,
    to: t.to,
    light: t.light,
    ink,
    dim: t.light ? rgba(id.paperInk, 0.66) : rgba(ink, 0.74),
    faint: t.light ? rgba(id.paperInk, 0.14) : rgba(ink, 0.16),
    accent,
    // Panel/plate surfaces — how a card sits on this slide in this mode.
    plate: t.light ? rgba('#FFFFFF', m.key === 'print' ? 0.72 : 0.62) : rgba('#000000', m.key === 'webtoon' ? 0.36 : 0.44),
    line: t.light ? rgba(id.paperInk, m.gutter ? 0.9 : 0.28) : rgba(ink, m.gutter ? 0.85 : 0.24),
    radius: m.radius,
    border: m.border,
    veil: VEIL[i % VEIL.length],
    onAccent: luminance(accent) > 0.42 ? '#0B0709' : '#FFFFFF',
  };
}
