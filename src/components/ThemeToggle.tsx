'use client';

import { Moon, Sun } from 'lucide-react';
import { useColorTheme } from './useColorTheme';

/**
 * The public navbar's light/dark switch (lib/color-theme.ts). One icon button
 * showing the theme it switches *to*, labelled in words for a screen reader.
 * Pressing it saves an explicit choice; until then the page follows the
 * system. The whole page cross-fades for one beat (paper-tokens.css,
 * `data-theme-switching`) so the change reads as one move, not a flicker.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useColorTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? 'Switch to Dark Theme' : 'Switch to Light Theme';

  const onClick = () => {
    const root = document.documentElement;
    root.setAttribute('data-theme-switching', '');
    setTheme(next);
    window.setTimeout(() => root.removeAttribute('data-theme-switching'), 260);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`site-theme-toggle ${className}`}
    >
      {next === 'dark' ? <Moon size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}
    </button>
  );
}
