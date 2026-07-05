import { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'mangarecs_theme';

const darkColors = {
  background: '#0D0D0F',
  card: '#13131A',
  primary: '#7B5CFF',
  muted: '#888892',
  border: '#1C1C1E',
  accent: '#1D9E75',
  error: '#FF3B30',
  text: '#FFFFFF',
  textSecondary: '#888892',
  inputBg: '#080808',
};

const lightColors = {
  background: '#F5F5F7',
  card: '#FFFFFF',
  primary: '#7B5CFF',
  muted: '#6E6E78',
  border: '#E2E2E7',
  accent: '#1D9E75',
  error: '#FF3B30',
  text: '#0D0D0F',
  textSecondary: '#6E6E78',
  inputBg: '#EBEBF0',
};

const ThemeContext = createContext({
  theme: 'dark',
  setTheme: () => {},
  isDark: true,
  colors: darkColors,
});

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [theme, setThemeState] = useState('dark');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'dark' || saved === 'light' || saved === 'system') {
        setThemeState(saved);
      }
      setLoaded(true);
    });
  }, []);

  const setTheme = async (t) => {
    setThemeState(t);
    await AsyncStorage.setItem(STORAGE_KEY, t);
  };

  const isDark =
    theme === 'system' ? systemScheme === 'dark' : theme === 'dark';

  const colors = isDark ? darkColors : lightColors;

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
