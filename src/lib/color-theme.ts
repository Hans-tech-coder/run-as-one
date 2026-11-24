/**
 * The visitor's light/dark choice for the Paper look — the one rule: an
 * explicit choice ("light" / "dark", kept in localStorage) outranks the
 * system setting, and with no choice saved the page follows the system.
 *
 * How it reaches the page: `THEME_INIT_SCRIPT` runs inline in the root
 * layout's <head>, before the first paint, and writes the resolved theme onto
 * `<html data-color-theme="light|dark">`. `src/app/paper-tokens.css` flips the
 * Paper palette on that attribute, but only for a frame that opts in with
 * `data-follows-theme` (today the public frame, ClientLayoutWrapper; the
 * dashboard opts in when it moves onto Paper). A frame without the marker
 * stays light Paper whatever the attribute says.
 *
 * localStorage, not a cookie: a cookie read in the root layout would make
 * every route dynamic (layout.tsx, "No request API here"), and the inline
 * script already draws the right theme on the first paint without the server.
 *
 * The dashboard's own switch (`app/admin/dashboard-theme.ts`, cookie
 * `dash_theme`) is separate until the admin Paper pass folds it in here.
 */

export type ColorThemeChoice = 'light' | 'dark' | 'system';
export type ColorTheme = 'light' | 'dark';

export const COLOR_THEME_STORAGE_KEY = 'rao-color-theme';
/** On <html>: the resolved theme, written before paint. */
export const COLOR_THEME_ATTR = 'data-color-theme';
/** Fired on window when the choice changes in this tab. */
export const COLOR_THEME_EVENT = 'rao:color-theme';

/** Inline in <head>. Kept tiny and dependency-free; it cannot import. */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,c=null;try{c=localStorage.getItem(${JSON.stringify(COLOR_THEME_STORAGE_KEY)})}catch(e){}var t=c==="dark"||c==="light"?c:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");d.setAttribute(${JSON.stringify(COLOR_THEME_ATTR)},t)}catch(e){}})()`;

export function readColorThemeChoice(): ColorThemeChoice {
  try {
    const value = localStorage.getItem(COLOR_THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function systemColorTheme(): ColorTheme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveColorTheme(choice: ColorThemeChoice): ColorTheme {
  return choice === 'system' ? systemColorTheme() : choice;
}

/** Client only: save the choice and repaint the document at once. */
export function setColorThemeChoice(choice: ColorThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(COLOR_THEME_STORAGE_KEY);
    else localStorage.setItem(COLOR_THEME_STORAGE_KEY, choice);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  document.documentElement.setAttribute(COLOR_THEME_ATTR, resolveColorTheme(choice));
  window.dispatchEvent(new Event(COLOR_THEME_EVENT));
}

/** The theme currently drawn, read from <html> (client only). */
export function currentColorTheme(): ColorTheme {
  return document.documentElement.getAttribute(COLOR_THEME_ATTR) === 'dark' ? 'dark' : 'light';
}
