import { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Pre-Default/Dark split, the app only had light/dark/system. Kept around
// read-only so existing installs can be migrated without changing anyone's
// look out from under them (see migration effect below).
const LEGACY_STORAGE_KEY = 'mangarecs_theme';
export const THEME_STORAGE_KEY = 'mangarecs_theme_v2';

// "Legacy" — the app's original black + purple look, and what used to be the
// default. The stored id is still `default`: it is written into every existing
// install's AsyncStorage, so renaming it would mean a second migration to buy
// nothing. Only the label users see moved.
//
// One value has moved since: `primary` went #7B5CFF -> #7858FF. White label
// text on the old #7B5CFF measured 4.36:1, just under the 4.5:1 WCAG AA bar
// for body text, and button labels here are 14-15px semibold — too small to
// qualify for the 3:1 large-text allowance. The fix is a 0.7% lightness step
// on the same hue, which reads as the same purple and clears 4.53:1.
// Verified by scripts/check-contrast.js.
const defaultColors = {
  background: '#0D0D0F',
  card: '#13131A',
  primary: '#7858FF',
  onPrimary: '#FFFFFF',
  muted: '#888892',
  border: '#1C1C1E',
  accent: '#1D9E75',
  error: '#FF3B30',
  text: '#FFFFFF',
  textSecondary: '#888892',
  inputBg: '#080808',
};

// "Dark" — true-black surfaces, same brand purple accent as Legacy/Light.
//
// `primary` was white for a while (a monochrome-accent experiment — see git
// history), but that reads as too bright/glary on a true-black background, so
// it's back to the same #7858FF used everywhere else: one accent colour across
// all three themes, Dark's distinctiveness comes from the true-black
// background/card instead. #7858FF clears the 3:1 AA_LARGE floor against both
// #000000 and #0C0C0E — verified by scripts/check-contrast.js.
//
// `onPrimary` flips back to white since primary is purple again: everywhere
// primary is a *fill* — button backgrounds, the logo mark, filled pills — the
// label needs to come from the palette instead of a hardcoded colour.
// `muted` was #77777F at 4.40:1 on card, just under the body-text bar.
const darkColors = {
  background: '#000000',
  card: '#0C0C0E',
  primary: '#7858FF',
  onPrimary: '#FFFFFF',
  muted: '#797981',
  border: '#1A1A1C',
  accent: '#1D9E75',
  error: '#FF3B30',
  text: '#FFFFFF',
  textSecondary: '#84848C',
  inputBg: '#000000',
};

// `muted` was #6E6E78, which is fine on background and card but only 4.24:1
// on the grey input fill — and muted is what placeholder text uses, so the
// one surface it failed on was the one where it matters most.
const lightColors = {
  background: '#F5F5F7',
  card: '#FFFFFF',
  primary: '#7858FF',
  onPrimary: '#FFFFFF',
  muted: '#6A6A74',
  border: '#E2E2E7',
  accent: '#1D9E75',
  error: '#FF3B30',
  text: '#0D0D0F',
  textSecondary: '#6A6A74',
  inputBg: '#EBEBF0',
};

const PALETTES = { default: defaultColors, dark: darkColors, light: lightColors };
const VALID_THEMES = ['default', 'dark', 'light'];

// Where a brand-new install lands: whatever the OS is set to. A phone set to
// light opens in Light; anything else (dark, or no preference) opens in
// Legacy — never the moodier Dark, which is opt-in only. Also seeds the
// *first paint*, before AsyncStorage has answered, so there's no flash: a
// phone set to dark never paints Light for a frame.
function seedFromSystem(systemScheme) {
  return systemScheme === 'light' ? 'light' : 'default';
}

const ThemeContext = createContext({
  theme: 'default',
  setTheme: () => {},
  isDark: true,
  colors: defaultColors,
});

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  // Seed the very first paint from the OS so a light-mode phone never
  // flashes the dark palette while AsyncStorage is still loading.
  const [theme, setThemeState] = useState(() => seedFromSystem(systemScheme));

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (VALID_THEMES.includes(saved)) {
          setThemeState(saved);
          return;
        }
        // No v2 value yet. Either this is a genuinely new install — seeded
        // from the OS setting, same as the first-paint guess above — or an
        // old one that predates the split, in which case migrate so nobody's
        // chosen look changes out from under them: old "dark" was this exact
        // black+purple palette under a different name, and old "system"
        // resolved to it on any dark-set phone.
        const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
        let migrated = seedFromSystem(systemScheme);
        if (legacy === 'light') migrated = 'light';
        else if (legacy === 'dark') migrated = 'default';
        else if (legacy === 'system') migrated = seedFromSystem(systemScheme);
        setThemeState(migrated);
        await AsyncStorage.setItem(THEME_STORAGE_KEY, migrated);
      } catch (_) {
        // Storage read failed — keep the OS-seeded guess from useState above.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = async (t) => {
    setThemeState(t);
    try { await AsyncStorage.setItem(THEME_STORAGE_KEY, t); } catch (_) {}
  };

  const isDark = theme !== 'light';
  const colors = PALETTES[theme] || defaultColors;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
