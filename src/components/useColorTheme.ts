'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  COLOR_THEME_EVENT,
  COLOR_THEME_STORAGE_KEY,
  currentColorTheme,
  readColorThemeChoice,
  switchColorTheme,
  COLOR_THEME_ATTR,
  systemColorTheme,
  type ColorTheme,
} from '@/lib/color-theme';

/**
 * The resolved light/dark theme (lib/color-theme.ts) and a setter. The server
 * snapshot is "light", the theme the HTML is rendered in; the inline <head>
 * script has already drawn the real one, and React catches up right after
 * hydration. It also keeps "system" live: a visitor with no saved choice who
 * flips their OS setting sees the page follow, and another tab's choice
 * (the `storage` event) is picked up here too.
 */
function subscribe(onChange: () => void) {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const sync = () => {
    if (readColorThemeChoice() === 'system') {
      document.documentElement.setAttribute(COLOR_THEME_ATTR, systemColorTheme());
    }
    onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== COLOR_THEME_STORAGE_KEY) return;
    const choice = readColorThemeChoice();
    document.documentElement.setAttribute(
      COLOR_THEME_ATTR,
      choice === 'system' ? systemColorTheme() : choice,
    );
    onChange();
  };
  window.addEventListener(COLOR_THEME_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  media?.addEventListener('change', sync);
  return () => {
    window.removeEventListener(COLOR_THEME_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
    media?.removeEventListener('change', sync);
  };
}

const getServerSnapshot = (): ColorTheme => 'light';

/** `setTheme` cross-fades the page for one beat (lib/color-theme.ts, `switchColorTheme`). */
export function useColorTheme() {
  const theme = useSyncExternalStore(subscribe, currentColorTheme, getServerSnapshot);
  const setTheme = useCallback((next: ColorTheme) => switchColorTheme(next), []);
  return { theme, setTheme };
}
