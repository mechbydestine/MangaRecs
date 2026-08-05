// Profile banner/ring accent colors — unrelated to the app's Default/Dark/
// Light theme (utils/ThemeContext.js). Shared by ProfileScreen (picking your
// own) and FriendProfileScreen (rendering someone else's already-chosen one).
// minGrade gates a theme behind reaching that badge tier (tier-up reward):
// 'purple' = Diamond, 'gold' = Master (see GRADE_ORDER in utils/badges).
export const PROFILE_THEMES = [
  { id: 'default', label: 'Default', ring: '#7B5CFF', gradient: ['#7B5CFF', '#1D9E75'], banner: ['#7B5CFF', '#0D0D0F'] },
  { id: 'rose',    label: 'Rose',    ring: '#D4537E', gradient: ['#D4537E', '#993556'], banner: ['#D4537E', '#0D0D0F'] },
  { id: 'sky',     label: 'Sky',     ring: '#378ADD', gradient: ['#378ADD', '#185FA5'], banner: ['#378ADD', '#0D0D0F'] },
  { id: 'emerald', label: 'Emerald', ring: '#1D9E75', gradient: ['#1D9E75', '#0F6E56'], banner: ['#1D9E75', '#0D0D0F'] },
  { id: 'amber',   label: 'Amber',   ring: '#EF9F27', gradient: ['#EF9F27', '#BA7517'], banner: ['#EF9F27', '#0D0D0F'] },
  { id: 'violet',  label: 'Violet',  ring: '#7F77DD', gradient: ['#7F77DD', '#D4537E'], banner: ['#7F77DD', '#0D0D0F'], minGrade: 'purple', gradeLabel: 'Diamond' },
  { id: 'crimson', label: 'Crimson', ring: '#FF5C7A', gradient: ['#FF5C7A', '#7A0F2E'], banner: ['#FF5C7A', '#0D0D0F'], minGrade: 'gold',   gradeLabel: 'Master' },
];

// id → accent hex, derived from the table above rather than restated. Five
// screens (Feed, Social, DM, Discussion, Notifications) each carried their own
// hand-copied version of this map; Notifications' copy had silently drifted and
// was missing 'crimson', so Master-tier users rendered with the default purple
// there but their real colour everywhere else.
export const PROFILE_ACCENTS = Object.fromEntries(
  PROFILE_THEMES.map((t) => [t.id, t.ring]),
);

export const DEFAULT_PROFILE_ACCENT = PROFILE_ACCENTS.default;

// Accepts a theme id ('rose'), a raw hex from older accounts, or null.
export function profileAccent(color) {
  if (!color) return DEFAULT_PROFILE_ACCENT;
  if (typeof color === 'string' && color.startsWith('#')) return color;
  return PROFILE_ACCENTS[color] || DEFAULT_PROFILE_ACCENT;
}
