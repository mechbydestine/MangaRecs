// Single source of truth for genres across the app. Every surface — the mood
// chips and taste-profile radar (ForYouScreen), onboarding's genre picker, and
// the creator dashboard picker — renders from this list so genre names and
// icons always match. Icons are Ionicons names chosen to read literally for
// the genre; `iconActive` is the filled variant shown while selected/playing.
export const GENRES = [
  { label: 'Action',                   icon: 'flash-outline',          iconActive: 'flash' },
  { label: 'Adventure',                icon: 'compass-outline',        iconActive: 'compass' },
  { label: 'Comedy',                   icon: 'happy-outline',          iconActive: 'happy' },
  { label: 'Cyberpunk',                icon: 'hardware-chip-outline',  iconActive: 'hardware-chip' },
  { label: 'Drama',                    icon: 'film-outline',           iconActive: 'film' },
  { label: 'Fantasy',                  icon: 'sparkles-outline',       iconActive: 'sparkles' },
  { label: 'Horror',                   icon: 'skull-outline',          iconActive: 'skull' },
  { label: 'Isekai',                   icon: 'planet-outline',         iconActive: 'planet' },
  { label: 'Martial Arts',             icon: 'barbell-outline',        iconActive: 'barbell' },
  { label: 'Murim',                    icon: 'shield-half-outline',    iconActive: 'shield-half' },
  { label: 'Mystery',                  icon: 'search-outline',         iconActive: 'search' },
  { label: 'Regression/Reincarnation', icon: 'refresh-circle-outline', iconActive: 'refresh-circle' },
  { label: 'Romance',                  icon: 'heart-outline',          iconActive: 'heart' },
  { label: 'Sci-Fi',                   icon: 'rocket-outline',         iconActive: 'rocket' },
  { label: 'Slice of Life',            icon: 'cafe-outline',           iconActive: 'cafe' },
  { label: 'Sports',                   icon: 'basketball-outline',     iconActive: 'basketball' },
  { label: 'Thriller',                 icon: 'eye-outline',            iconActive: 'eye' },
];

// label → outline icon, for surfaces that look genres up by name
export const GENRE_ICON_MAP = {};
GENRES.forEach((g) => { GENRE_ICON_MAP[g.label] = g.icon; });

// Picker-compatible format: { label, value }
export const GENRE_PICKER_OPTIONS = GENRES.map(g => ({ label: g.label, value: g.label }));
