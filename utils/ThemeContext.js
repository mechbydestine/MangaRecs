import { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Pre-Default/Dark split, the app only had light/dark/system. Kept around
// read-only so existing installs can be migrated without changing anyone's
// look out from under them (see migration effect below).
const LEGACY_STORAGE_KEY = 'mangarecs_theme';
export const THEME_STORAGE_KEY = 'mangarecs_theme_v2';

// "Default" — the app's original black + purple look.
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

// "Dark" — a distinct, moodier option: true-black surfaces and a monochrome
// accent instead of Default's vivid purple.
//
// `primary` has been through three values here. #5B4E8A measured 2.70:1
// against the card, below the 3:1 WCAG floor for a colour that carries meaning
// (active tabs, icons, selected states), so it read as disabled. #635495
// cleared the bar but was still a desaturated purple — muddy next to Default's
// and not really its own look. White is: it's the sharpest possible accent on
// true black, and it makes Dark read as deliberately monochrome rather than as
// Default with the colour drained out of it.
//
// This is why `onPrimary` exists. Everywhere primary is a *fill* — button
// backgrounds, the logo mark, filled pills — white-on-white would be invisible,
// so the foreground has to come from the palette instead of a hardcoded #fff.
// `muted` was #77777F at 4.40:1 on card, just under the body-text bar.
const darkColors = {
  background: '#000000',
  card: '#0C0C0E',
  primary: '#FFFFFF',
  onPrimary: '#000000',
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

function seedFromSystem(systemScheme) {
  // Brand-new installs (nothing saved yet, old or new key) start from the
  // OS setting: a phone set to light opens in Light, anything else opens in
  // Default — never the moodier Dark, which is opt-in only.
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
        // No v2 value yet — migrate from the old light/dark/system scheme so
        // nobody's chosen look changes out from under them: old "dark" was
        // this exact black+purple palette under a different name, and old
        // "system" resolved to it on any phone with a dark OS setting.
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
