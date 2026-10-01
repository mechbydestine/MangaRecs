// Badge token renderer — the website half of components/BadgeIcon.js.
//
// Same geometry, same 19 emblems, same tier materials, so a badge looks
// identical on mangarecs.net and in the app. Kept as a hand port rather than a
// shared module because the site loads plain classic scripts with globals and
// the app half is JSX over react-native-svg; if one side's art changes, change
// the other in the same breath.
//
// Deliberately no <filter> and no CSS: every glow is a radial-gradient circle,
// which is what keeps the two renderers in sync (react-native-svg can't do
// filters) and keeps these cheap enough to stamp out 250 at a time.
//
// renderBadgeToken(badge, { size, locked }) -> SVG markup string.

(function (global) {
  'use strict';

  // Six tiers: Common / Uncommon / Platinum / Diamond / Legendary / Mythic.
  // Must stay identical to TIERS in components/BadgeIcon.js.
  var TIERS = {
    grey:   { rim:'#D4DCE8', mid:'#8A93A3', deep:'#474E5A', disc:'#141619', leaves:5, rows:1, bigGem:false, ticks:false, motes:0, glow:0.00, irid:false },
    green:  { rim:'#8CEFB4', mid:'#27A35E', deep:'#12512F', disc:'#0B1711', leaves:6, rows:1, bigGem:false, ticks:false, motes:0, glow:0.12, irid:false },
    blue:   { rim:'#8FEFF9', mid:'#22A7BD', deep:'#0C5361', disc:'#071618', leaves:7, rows:1, bigGem:true,  ticks:true,  motes:0, glow:0.22, irid:false },
    indigo: { rim:'#7FB2FF', mid:'#1E46B4', deep:'#0D1F5E', disc:'#070C1A', leaves:8, rows:1, bigGem:true,  ticks:true,  motes:3, glow:0.32, irid:false },
    gold:   { rim:'#FBE08A', mid:'#D99A14', deep:'#6E4A05', disc:'#191307', leaves:8, rows:2, bigGem:true,  ticks:true,  motes:5, glow:0.42, irid:false },
    mythic: { rim:'#FF9AAA', mid:'#D21F3C', deep:'#5E0C1C', disc:'#17080E', leaves:9, rows:2, bigGem:true,  ticks:true,  motes:7, glow:0.54, irid:true  }
  };

  var CX = 50, CY = 50, RING = 36, DISC = 30, WREATH = 40;
  var PROGRESS = { grey: 1, green: 1, blue: 1 };
  var seq = 0;

  function n(v) { return Number(v.toFixed(2)); }

  function leaf(ax, ay, len, wid, dirDeg) {
    var r = dirDeg * Math.PI / 180;
    var dx = Math.cos(r), dy = Math.sin(r);
    var px = -dy, py = dx;
    var tx = ax + dx * len, ty = ay + dy * len;
    var mx = ax + dx * len * 0.52, my = ay + dy * len * 0.52;
    return 'M' + n(ax) + ' ' + n(ay) +
           'Q' + n(mx + px * wid) + ' ' + n(my + py * wid) + ' ' + n(tx) + ' ' + n(ty) +
           'Q' + n(mx - px * wid) + ' ' + n(my - py * wid) + ' ' + n(ax) + ' ' + n(ay) + 'Z';
  }

  // side 1 = left arm, -1 = mirrored right arm (mirrored numerically, not via
  // an SVG transform, so both renderers produce identical path data)
  function arm(count, radius, lenBase, side) {
    var d = '';
    for (var i = 0; i < count; i++) {
      var t = count === 1 ? 0 : i / (count - 1);
      var deg = 100 + t * 102;
      var rad = deg * Math.PI / 180;
      var ax = CX + side * radius * Math.cos(rad);
      var ay = CY + radius * Math.sin(rad);
      var k = 52 * Math.PI / 180;
      var dx = -Math.sin(rad) * Math.cos(k) + Math.cos(rad) * Math.sin(k);
      var dy = Math.cos(rad) * Math.cos(k) + Math.sin(rad) * Math.sin(k);
      var dir = Math.atan2(dy, dx) * 180 / Math.PI;
      if (side < 0) dir = 180 - dir;
      var len = lenBase * (1 - 0.26 * t);
      d += leaf(ax, ay, len, len * 0.42, dir);
    }
    return d;
  }

  function branch(radius, side) {
    var a0 = 100 * Math.PI / 180, a1 = 202 * Math.PI / 180;
    return 'M' + n(CX + side * radius * Math.cos(a0)) + ' ' + n(CY + radius * Math.sin(a0)) +
           'A' + radius + ' ' + radius + ' 0 0 ' + (side > 0 ? 0 : 1) + ' ' +
           n(CX + side * radius * Math.cos(a1)) + ' ' + n(CY + radius * Math.sin(a1));
  }

  function star4(cx, cy, s) {
    var w = s * 0.2;
    return 'M' + n(cx) + ' ' + n(cy - s) +
           'Q' + n(cx + w) + ' ' + n(cy - w) + ' ' + n(cx + s) + ' ' + n(cy) +
           'Q' + n(cx + w) + ' ' + n(cy + w) + ' ' + n(cx) + ' ' + n(cy + s) +
           'Q' + n(cx - w) + ' ' + n(cy + w) + ' ' + n(cx - s) + ' ' + n(cy) +
           'Q' + n(cx - w) + ' ' + n(cy - w) + ' ' + n(cx) + ' ' + n(cy - s) + 'Z';
  }

  function gemPath(cx, cy, s) {
    return 'M' + n(cx) + ' ' + n(cy - s) + 'L' + n(cx + s * 0.72) + ' ' + n(cy) +
           'L' + n(cx) + ' ' + n(cy + s) + 'L' + n(cx - s * 0.72) + ' ' + n(cy) + 'Z';
  }

  function burst(cx, cy, outer, inner, points) {
    var d = '';
    for (var i = 0; i < points * 2; i++) {
      var r = i % 2 ? inner : outer;
      var a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      d += (i ? 'L' : 'M') + n(cx + Math.cos(a) * r) + ' ' + n(cy + Math.sin(a) * r);
    }
    return d + 'Z';
  }

  // Emblems use "E" (emblem colour), "D" (disc knock-out) and "W" (highlight)
  // as placeholders, swapped per render. Mirrors EMBLEMS in BadgeIcon.js.
  var EMBLEMS = {
    chapters: '<path d="M50 42C46 38.5 40 37 34 37.5L34 58.5C40 58 46 59.5 50 62Z" fill="E"/><path d="M50 42C54 38.5 60 37 66 37.5L66 58.5C60 58 54 59.5 50 62Z" fill="E"/><path d="M38 43.5h8M38 48h9M38 52.5h7M54 43.5h8M53 48h9M55 52.5h7" stroke="D" stroke-width="1.3" stroke-linecap="round"/>',
    hours: '<path d="M37 33h26v2.6H37Zm0 31.4h26V67H37Z" fill="E"/><path d="M39.5 35.6h21c0 7-6.2 10.6-10.5 14.4-4.3-3.8-10.5-7.4-10.5-14.4Z" fill="E"/><path d="M39.5 64.4h21c0-7-6.2-10.6-10.5-14.4-4.3 3.8-10.5 7.4-10.5 14.4Z" fill="E"/><path d="' + star4(50, 50, 3.8) + '" fill="W"/>',
    streak: '<path d="M50 32c2.5 7.5 8 10 9.5 16.5 1.6 7-2.5 14.5-9.5 14.5s-11-6-9.4-13c1.1-4.8 3.9-7 5-10.8 1.6 2.7 2.1 5.3 2.6 7 1.1-4.3 1.6-9.3 1.8-14.2Z" fill="E"/><path d="M50 47.5c1.7 3 3.2 5 3.2 8 0 3.6-1.6 5.6-3.2 5.6s-3.2-2-3.2-5.3c0-3 1.6-5.2 3.2-8.3Z" fill="D"/>',
    series: '<path d="M34 35h8v24l-4-5-4 5Z" fill="E" opacity="0.75"/><path d="M58 35h8v24l-4-5-4 5Z" fill="E" opacity="0.75"/><path d="M45.5 30h9v32l-4.5-5.5-4.5 5.5Z" fill="E"/>',
    manga: '<path d="M28 55h44v9H28Z" fill="E"/><path d="M35 55h37v9H35Z" fill="D" opacity="0.28"/><path d="M31 44.5h38v9H31Z" fill="E"/><path d="M37.5 44.5h31.5v9H37.5Z" fill="D" opacity="0.28"/><path d="M34 34h32v9H34Z" fill="E"/><path d="M40 34h26v9H40Z" fill="D" opacity="0.28"/><path d="M31.5 57.5v4M34.5 47v4M37.5 36.5v4" stroke="D" stroke-width="1.6" stroke-linecap="round"/>',
    completed: '<path d="M34 33h28a3 3 0 0 1 3 3v28a3 3 0 0 1-3 3H34Z" fill="E"/><path d="M34 33h5v34h-5Z" fill="D" opacity="0.35"/><circle cx="53" cy="50" r="7.5" fill="D" opacity="0.5"/><path d="' + burst(53, 50, 6, 2.6, 5) + '" fill="E"/>',
    midnight: '<path d="M58 36c-7.6 1.3-13.4 7.6-13.4 15.2S50.4 65 58 66.3c-5.7-3.4-9-9-9-15.1S52.3 39.4 58 36Z" fill="E"/><path d="' + star4(63, 39, 4) + '" fill="E" opacity="0.9"/><path d="' + star4(66, 48.5, 2.4) + '" fill="E" opacity="0.6"/>',
    comments: '<path d="M38 36h24a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6H48l-9.5 7.5 2-7.5H38a6 6 0 0 1-6-6V42a6 6 0 0 1 6-6Z" fill="E"/><circle cx="43" cy="47" r="2.1" fill="D"/><circle cx="50" cy="47" r="2.1" fill="D"/><circle cx="57" cy="47" r="2.1" fill="D"/>',
    likes: '<path d="M50 64C37 55 31.5 48 31.5 41.4 31.5 36 35.8 32.2 40.6 32.2c3.9 0 7.3 2.3 9.4 6 2.1-3.7 5.5-6 9.4-6 4.8 0 9.1 3.8 9.1 9.2 0 6.6-5.5 13.6-18.5 22.6Z" fill="E"/><path d="M40 36.5c2.3-.3 4.4.5 6 2.3" stroke="W" stroke-width="1.7" fill="none" stroke-linecap="round" opacity="0.45"/>',
    friends: '<circle cx="59" cy="42" r="6.5" fill="E" opacity="0.72"/><path d="M47 64c0-7.5 5-12 12-12s12 4.5 12 12Z" fill="E" opacity="0.72"/><circle cx="42" cy="44" r="7.5" fill="E"/><path d="M28 65c0-8.5 6-13.5 14-13.5S56 56.5 56 65Z" fill="E"/><path d="M52 51.5a13 13 0 0 1 4 6" stroke="D" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.6"/>',
    shares: '<path d="M70 31 32 46.5 46.5 52Z" fill="E"/><path d="M70 31 46.5 52 49.5 67Z" fill="E" opacity="0.75"/><path d="M26 54h9M24 60h11" stroke="E" stroke-width="2" stroke-linecap="round" opacity="0.55"/>',
    ratings: '<path d="M36 35h28a3.5 3.5 0 0 1 3.5 3.5v23A3.5 3.5 0 0 1 64 65H36a3.5 3.5 0 0 1-3.5-3.5v-23A3.5 3.5 0 0 1 36 35Z" fill="E"/><path d="' + burst(50, 50, 10.5, 4.4, 5) + '" fill="D"/><path d="M33 31.5c6-2 28-2 34 0" stroke="E" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.6"/>',
    genres: '<path d="M50 30 67 43 59.5 66h-19L33 43Z" fill="E"/><path d="M50 30v36M33 43h34M50 66 33 43M50 66 67 43" stroke="D" stroke-width="1.3" opacity="0.75"/>',
    account: '<path d="M34 66V46a16 16 0 0 1 32 0v20Z" fill="E"/><path d="M40.5 66V46a9.5 9.5 0 0 1 19 0v20Z" fill="D"/><path d="M44.5 66V46.5a5.5 5.5 0 0 1 11 0V66Z" fill="E" opacity="0.3"/><path d="' + star4(50, 52, 5.5) + '" fill="W"/><path d="M30 67.5h40" stroke="E" stroke-width="2.6" stroke-linecap="round"/>',
    profile: '<path d="M50 30c10 0 16.5 7 16.5 16.5 0 11.5-7 22.5-16.5 24.5-9.5-2-16.5-13-16.5-24.5C33.5 37 40 30 50 30Z" fill="E"/><path d="M39 46c2-3.2 6.5-3.2 8.5 0-2 3.2-6.5 3.2-8.5 0ZM52.5 46c2-3.2 6.5-3.2 8.5 0-2 3.2-6.5 3.2-8.5 0Z" fill="D"/><path d="M46 58c2.5 1.6 5.5 1.6 8 0" stroke="D" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    special: '<path d="' + star4(50, 49, 19) + '" fill="E"/><path d="' + star4(50, 49, 9) + '" fill="W" opacity="0.55"/><path d="' + star4(34, 36, 5) + '" fill="E" opacity="0.7"/><path d="' + star4(66, 60, 4) + '" fill="E" opacity="0.55"/>',
    binge: '<path d="' + burst(50, 49, 20, 8.5, 9) + '" fill="E"/><path d="' + burst(50, 49, 9, 3.6, 9) + '" fill="D" opacity="0.55"/>',
    speed: '<path d="M55 29 35 53h11l-3 18 20-24H52Z" fill="E"/>',
    weekend: '<circle cx="41" cy="49" r="9" fill="E"/><path d="M41 34v4.5M41 59.5V64M26 49h4.5M51.5 49H56M30.5 38.5l3 3M51.5 56.5l-3-3M30.5 59.5l3-3M51.5 41.5l-3 3" stroke="E" stroke-width="2" stroke-linecap="round" opacity="0.8"/><path d="M68 36c-6 2-10 7.5-10 13.5S62 61 68 63c-4-3.5-6.5-8-6.5-13.5S64 39.5 68 36Z" fill="E" opacity="0.85"/>'
  };

  // Requirement types without their own drawing borrow the nearest one, until
  // the commissioned art lands. Mirrors EMBLEM_ALIAS in BadgeIcon.js.
  var ALIAS = {
    manga_titles: 'manga', manhwa_titles: 'series',
    discussions: 'comments', reactions: 'likes', badges: 'special'
  };

  function emblemKey(badge) {
    var raw = (badge && badge.emblem) || (badge && badge.requirement && badge.requirement.type);
    var k = ALIAS[raw] || raw;
    return EMBLEMS[k] ? k : 'special';
  }

  function renderBadgeToken(badge, opts) {
    opts = opts || {};
    var size = opts.size || 64;
    var locked = !!opts.locked;
    var grade = (badge && badge.grade) || 'grey';
    var tier = TIERS[grade] || TIERS.grey;

    // Locked splits two ways, same as the app: tiers that already advertise
    // progress stay legible, Platinum and up go to near-black so they keep
    // their mystery until earned.
    var mystery = locked && !PROGRESS[grade];
    var rim   = locked ? (mystery ? '#3A3F48' : '#6B727E') : tier.rim;
    var mid   = locked ? (mystery ? '#2A2E35' : '#4A515C') : tier.mid;
    var deep  = locked ? '#1A1D22' : tier.deep;
    var disc  = locked ? '#101216' : tier.disc;
    var emb   = locked ? (mystery ? '#272B31' : '#555C67') : tier.rim;
    var white = locked ? emb : '#FFFFFF';

    var detail = size >= 48;
    var uid = 'bt' + (seq++);
    var irid = tier.irid && !locked ? 'url(#i' + uid + ')' : null;

    var body = EMBLEMS[emblemKey(badge)]
      .split('"E"').join('"' + emb + '"')
      .split('"D"').join('"' + disc + '"')
      .split('"W"').join('"' + white + '"');

    var wreath = '';
    var rows = detail ? tier.rows : 1;
    var leaves = detail ? tier.leaves : Math.min(tier.leaves, 5);
    for (var r = 0; r < rows; r++) {
      var rad = WREATH - r * 5;
      var col = r === 0 ? (irid || rim) : mid;
      var op = r === 0 ? 0.95 : 0.6;
      var sides = [1, -1];
      for (var s = 0; s < sides.length; s++) {
        wreath += '<path d="' + branch(rad, sides[s]) + '" stroke="' + (r === 0 ? rim : mid) +
                  '" stroke-width="' + (r === 0 ? 1.6 : 1) + '" fill="none" opacity="' + (op * 0.85) + '" stroke-linecap="round"/>' +
                  '<path d="' + arm(leaves - r * 2, rad, 13 - r * 3.5, sides[s]) + '" fill="' + col + '" opacity="' + op + '"/>';
      }
    }

    var tieY = CY + WREATH * Math.sin(100 * Math.PI / 180);
    var tie = detail
      ? '<path d="M44 ' + n(tieY - 2.6) + 'h12a2.6 2.6 0 0 1 0 5.2H44a2.6 2.6 0 0 1 0-5.2Z" fill="' + (irid || rim) + '" opacity="0.95"/>' +
        '<path d="M47 ' + n(tieY + 2.4) + 'l-3 5.5M53 ' + n(tieY + 2.4) + 'l3 5.5" stroke="' + rim + '" stroke-width="1.7" stroke-linecap="round" opacity="0.8"/>'
      : '';

    var ticks = '';
    if (tier.ticks && detail && !mystery) {
      for (var a = -70; a <= 70; a += 14) {
        var tr = (a - 90) * Math.PI / 180;
        ticks += '<line x1="' + n(CX + Math.cos(tr) * (RING - 3)) + '" y1="' + n(CY + Math.sin(tr) * (RING - 3)) +
                 '" x2="' + n(CX + Math.cos(tr) * (RING + 1.5)) + '" y2="' + n(CY + Math.sin(tr) * (RING + 1.5)) +
                 '" stroke="' + rim + '" stroke-width="1" opacity="0.55"/>';
      }
    }

    var motes = '';
    if (!locked && detail) {
      for (var i = 0; i < tier.motes; i++) {
        var ma = (i / tier.motes) * Math.PI * 2 + 0.7;
        var mr = RING + 4 + (i % 2) * 3.5;
        motes += '<circle cx="' + n(CX + Math.cos(ma) * mr) + '" cy="' + n(CY + Math.sin(ma) * mr) +
                 '" r="' + (i % 2 ? 0.9 : 1.5) + '" fill="' + rim + '" opacity="0.75"/>';
      }
    }

    var gy = CY - RING;
    var gem = tier.bigGem
      ? '<path d="' + gemPath(CX, gy, 7) + '" fill="' + (irid || rim) + '"/>' +
        '<path d="M' + CX + ' ' + n(gy - 7) + 'L' + n(CX + 5) + ' ' + gy + 'L' + CX + ' ' + n(gy + 7) + 'Z" fill="' + mid + '" opacity="0.55"/>' +
        '<path d="M' + n(CX - 5) + ' ' + gy + 'L' + CX + ' ' + n(gy - 2.4) + 'L' + n(CX + 5) + ' ' + gy + 'L' + CX + ' ' + n(gy + 2.4) + 'Z" fill="' + deep + '" opacity="0.45"/>'
      : '<path d="' + gemPath(CX, gy, 5) + '" fill="' + mid + '"/><path d="' + gemPath(CX, gy, 2.2) + '" fill="' + deep + '" opacity="0.5"/>';

    var lock = locked
      ? '<path d="M45 55h10v9H45Z" fill="' + (mystery ? '#4A515C' : '#9AA0AD') + '"/>' +
        '<path d="M47 55v-3a3 3 0 0 1 6 0v3" stroke="' + (mystery ? '#4A515C' : '#9AA0AD') + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
      : '';

    var ringStops = tier.irid && !locked
      ? '<stop offset="0%" stop-color="#FFF3F8"/><stop offset="22%" stop-color="#FFB3C6"/><stop offset="45%" stop-color="#C77CF0"/><stop offset="68%" stop-color="#7CD9F0"/><stop offset="86%" stop-color="#F0C97C"/><stop offset="100%" stop-color="' + deep + '"/>'
      : '<stop offset="0%" stop-color="' + rim + '"/><stop offset="50%" stop-color="' + mid + '"/><stop offset="100%" stop-color="' + deep + '"/>';

    return '<svg class="badge-token" width="' + size + '" height="' + size + '" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<radialGradient id="g' + uid + '" cx="50%" cy="50%" r="50%"><stop offset="55%" stop-color="' + rim + '" stop-opacity="' + (locked ? 0 : tier.glow) + '"/><stop offset="100%" stop-color="' + rim + '" stop-opacity="0"/></radialGradient>' +
        '<radialGradient id="d' + uid + '" cx="38%" cy="30%" r="80%"><stop offset="0%" stop-color="' + deep + '" stop-opacity="' + (locked ? 0.5 : 0.95) + '"/><stop offset="55%" stop-color="' + disc + '"/><stop offset="100%" stop-color="#05060A"/></radialGradient>' +
        '<linearGradient id="r' + uid + '" x1="20%" y1="0%" x2="80%" y2="100%">' + ringStops + '</linearGradient>' +
        '<linearGradient id="i' + uid + '" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#FFB3C6"/><stop offset="35%" stop-color="#C77CF0"/><stop offset="70%" stop-color="#7CD9F0"/><stop offset="100%" stop-color="#FFE9A8"/></linearGradient>' +
        '<radialGradient id="b' + uid + '" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="' + rim + '" stop-opacity="' + (locked ? 0 : 0.3) + '"/><stop offset="100%" stop-color="' + rim + '" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      '<circle cx="50" cy="50" r="49" fill="url(#g' + uid + ')"/>' +
      (tier.irid && !locked && detail ? '<circle cx="50" cy="50" r="' + (RING + 5.5) + '" fill="none" stroke="' + rim + '" stroke-width="0.9" stroke-dasharray="2.5,3.5" opacity="0.55"/>' : '') +
      motes + wreath + tie +
      '<circle cx="50" cy="50" r="' + RING + '" fill="none" stroke="url(#r' + uid + ')" stroke-width="3.4"/>' +
      ticks +
      '<circle cx="50" cy="50" r="' + DISC + '" fill="url(#d' + uid + ')"/>' +
      '<circle cx="50" cy="50" r="' + DISC + '" fill="none" stroke="' + mid + '" stroke-width="0.8" opacity="0.5"/>' +
      '<circle cx="50" cy="50" r="23" fill="url(#b' + uid + ')"/>' +
      '<g transform="translate(50,50) scale(0.84) translate(-50,-50)">' + body + '</g>' +
      '<path d="M34 31C40 25 60 25 66 31 57 27.5 43 27.5 34 31Z" fill="#fff" opacity="' + (locked ? 0.04 : 0.1) + '"/>' +
      gem + lock +
    '</svg>';
  }

  global.renderBadgeToken = renderBadgeToken;
})(this);
