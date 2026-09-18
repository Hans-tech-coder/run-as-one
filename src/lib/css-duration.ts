/**
 * A motion token's length in milliseconds, read from `:root` — client only.
 *
 * The tokens are written in milliseconds (`--dropdown-close-dur: 150ms`), but
 * the production CSS minifier rewrites them to the shorter seconds form
 * (`.15s`), and so does the dev build. A bare `parseFloat` then reads 0.15 and
 * the timer that waits out a close fires almost at once, cutting the exit
 * animation off before it is seen. Both units are handled here, and the
 * fallback covers a token that is missing or unreadable.
 */
export function cssDurationMs(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  if (raw.endsWith('ms')) return value;
  if (raw.endsWith('s')) return value * 1000;
  return value;
}
