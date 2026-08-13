// When the recap covers, and when it opens.
//
// Kept out of RecapScreen deliberately. That screen imports expo-audio,
// expo-sensors and react-native-view-shot, none of which load under Jest, so
// the one part of the recap that genuinely needs testing — date arithmetic
// that runs unattended six months from now — could not be reached from a test
// while it lived there.

// The half the recap is about. Between January and June the interesting period
// is the half that just closed (Jul–Dec of last year); from July onward it is
// Jan–Jun of this year.
export function getPeriod(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  if (m >= 6) {
    return { label: `First Half ${y}`, short: `Jan – Jun ${y}`, start: new Date(y, 0, 1), end: new Date(y, 6, 0, 23, 59, 59) };
  }
  return { label: `Second Half ${y - 1}`, short: `Jul – Dec ${y - 1}`, start: new Date(y - 1, 6, 1), end: new Date(y, 0, 0, 23, 59, 59) };
}

// ── Release window ───────────────────────────────────────────────────────
// The recap is a twice-yearly event, not a screen that is permanently there. A
// half closes (30 June / 31 December) and the wrap-up for it drops the
// FOLLOWING week, on the Saturday. The gap is the point: it is what makes it
// arrive rather than simply exist.
//
// For a half ending Tuesday 30 June that is Saturday 11 July.
export function recapReleaseDate(period) {
  // Clear a full week of the period end, then move forward to the next
  // Saturday (staying put if that day already is one).
  const d = new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate() + 7);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

// On while the app is still being tested — waiting six months to look at the
// screen is not a workable way to build it. Set to false before launch and the
// schedule above takes over; nothing else has to change.
export const RECAP_ALWAYS_OPEN = true;

export function isRecapOpen(now = new Date(), period = getPeriod(now)) {
  if (RECAP_ALWAYS_OPEN) return true;
  return now >= recapReleaseDate(period);
}
