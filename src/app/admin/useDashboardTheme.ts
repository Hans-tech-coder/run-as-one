'use client';

import { useEffect } from 'react';
import { useColorTheme } from '@/components/useColorTheme';
import { archivo } from '@/app/archivo-font';

/**
 * The dashboard's light/dark theme — the app's one choice (lib/color-theme.ts,
 * localStorage `rao-color-theme`), the same one the public navbar's switch
 * writes. Split out of DashboardShell, which draws it on its frame.
 *
 * The colours do not wait for this: the <head> script has already written
 * `<html data-color-theme>`, and admin-paper.css points every dashboard name
 * at a `--paper-*` hue that attribute flips, so the first paint is right
 * without a cookie. What this adds is the frame's `data-theme` (the server
 * snapshot is "light", corrected on hydration), mirrored onto `<html>` while
 * the dashboard is mounted so what portals to `<body>` — row menus,
 * lightboxes, the notifications modal — carries it too. Archivo's variable
 * goes onto <body> for the same portals (admin-paper.css). Both are removed
 * on the way out; the public frame sets its own.
 */
export function useDashboardTheme() {
  const { theme } = useColorTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    return () => {
      delete root.dataset.theme;
    };
  }, [theme]);

  useEffect(() => {
    const classes = archivo.variable.split(' ').filter(Boolean);
    document.body.classList.add(...classes);
    return () => document.body.classList.remove(...classes);
  }, []);

  return theme;
}
