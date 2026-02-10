// Hook for theme management

import { useState, useEffect, useCallback } from 'react';
import type { Theme } from '@/types';
import * as storage from '@/utils/storage';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('dark');

  // Detect system theme preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');

    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Load theme from settings
  useEffect(() => {
    storage.getSettings().then(settings => {
      setThemeState(settings.theme);
    });
  }, []);

  // Apply theme to document
  useEffect(() => {
    const effectiveTheme = theme === 'system' ? systemTheme : theme;

    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(effectiveTheme);
  }, [theme, systemTheme]);

  // Set theme and save to storage
  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    await storage.updateSettings({ theme: newTheme });
  }, []);

  // Toggle between light and dark
  const toggleTheme = useCallback(async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    await setTheme(newTheme);
  }, [theme, setTheme]);

  // Get effective theme (resolving 'system')
  const effectiveTheme = theme === 'system' ? systemTheme : theme;

  return {
    theme,
    effectiveTheme,
    setTheme,
    toggleTheme,
    isDark: effectiveTheme === 'dark',
  };
}
