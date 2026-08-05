import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  APP_LANGUAGES, DEFAULT_APP_LANG, loadLanguage, persistLanguage, langLabel,
} from './language';
import { translate } from './i18n';

// App-wide language. A context rather than a bare AsyncStorage read because
// changing it has to re-render every screen that depends on it — the source
// row, the reader's chapter feed — the moment it changes, not the next time
// something happens to remount.

const LanguageContext = createContext({
  language: DEFAULT_APP_LANG,
  setLanguage: () => {},
  languages: APP_LANGUAGES,
  label: langLabel(DEFAULT_APP_LANG),
  ready: false,
  t: (key, vars) => translate(key, vars, DEFAULT_APP_LANG),
});

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(DEFAULT_APP_LANG);
  // Consumers that fetch on language change need to know whether the value
  // they're holding is the stored one or just the pre-load default, otherwise
  // every launch fires one request for English and a second for the real
  // language a moment later.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLanguage().then((l) => {
      if (cancelled) return;
      setLanguageState(l);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const setLanguage = useCallback((id) => {
    setLanguageState(id);
    persistLanguage(id);
  }, []);

  // `t` is rebuilt whenever the language changes, and that identity change is
  // what makes every consumer re-render with new strings. Memoised so it
  // doesn't churn on unrelated renders.
  const value = useMemo(() => ({
    language,
    setLanguage,
    languages: APP_LANGUAGES,
    label: langLabel(language),
    ready,
    t: (key, vars) => translate(key, vars, language),
  }), [language, setLanguage, ready]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

// Shorthand for the common case — a screen that only needs strings.
export function useT() {
  return useContext(LanguageContext).t;
}
