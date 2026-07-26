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
