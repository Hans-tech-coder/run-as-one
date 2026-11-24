/**
 * The visitor's light/dark choice for the Paper look — the one rule: an
 * explicit choice ("light" / "dark", kept in localStorage) outranks the
 * system setting, and with no choice saved the page follows the system.
 *
 * How it reaches the page: `THEME_INIT_SCRIPT` runs inline in the root
 * layout's <head>, before the first paint, and writes the resolved theme onto
 * `<html data-color-theme="light|dark">`. `src/app/paper-tokens.css` flips the
 * Paper palette on that attribute, but only for a frame that opts in with
 * `data-follows-theme`: the public frame (ClientLayoutWrapper), the dashboard
 * (DashboardShell) and the sign-in screens (AuthPaperFrame). A frame without
 * the marker — the print copies — stays light Paper whatever it says.
 *
 * localStorage, not a cookie: a cookie read in the root layout would make
 * every route dynamic (layout.tsx, "No request API here"), and the inline
 * script already draws the right theme on the first paint without the server.
 *
 * **One switch for the whole app** (2026-11-24): the public navbar's
 * ThemeToggle and the dashboard account menu's Dark Mode row both write this
 * one choice. The dashboard's old cookie (`dash_theme`) is gone: nothing the
 * server draws depends on the theme any more — every hue is a `--paper-*`
 * name flipped by the attribute above — so there is nothing to render ahead
 * of the script, and the admin layout reads no theme cookie.
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

/** How long the page cross-fades while switching (paper-tokens.css). */
const SWITCH_FADE_MS = 260;

/**
 * Client only: the switch as a person presses it — save the choice, and mark
 * `<html data-theme-switching>` for one beat so the big grounds cross-fade
 * (paper-tokens.css) instead of snapping. ThemeToggle and the account menu
 * both press it here, so the two switches cannot feel different.
 */
export function switchColorTheme(next: ColorTheme) {
  const root = document.documentElement;
  root.setAttribute('data-theme-switching', '');
  setColorThemeChoice(next);
  window.setTimeout(() => root.removeAttribute('data-theme-switching'), SWITCH_FADE_MS);
}
