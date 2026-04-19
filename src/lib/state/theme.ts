import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'loki-ui:theme';

function readStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

function systemPreference(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function currentTheme(): Theme {
  return readStoredTheme() ?? systemPreference();
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Cross-tab sync: if another tab changes the theme, follow
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue === 'dark' || e.newValue === 'light'
        ? (e.newValue as Theme)
        : systemPreference();
      setThemeState(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Follow system preference when no explicit choice is stored
  useEffect(() => {
    if (readStoredTheme() !== null) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setThemeState(systemPreference());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = (next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — theme still applies for this tab
    }
    setThemeState(next);
  };

  return [theme, setTheme];
}
