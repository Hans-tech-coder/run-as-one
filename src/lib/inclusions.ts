/**
 * What a category or package gets you, as a list.
 *
 * The admin edits this as free text — one item per line — because an organizer
 * typing four or five short things wants to type them, not click "Add" between
 * each one, and because a list like this is usually pasted straight off the
 * poster they already made. Storage is a real array, so the event page can
 * render each item as its own row without re-parsing.
 */

/** Bullets an organizer is likely to paste in, which are formatting, not content. */
const BULLET = /^[\s ]*(?:[-–—*•·]|\d+[.)])\s+/;

/**
 * Text from the editor to the list that gets stored.
 *
 * Blank lines are dropped rather than kept as empty items, so a trailing
 * newline or a gap between groups costs nothing.
 */
export function parseInclusions(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.replace(BULLET, '').trim())
    .filter(Boolean);
}

/** The stored list back into editor text. */
export function formatInclusions(list: readonly string[] | null | undefined): string {
  return (list ?? []).join('\n');
}

/**
 * Whatever the request body carried, as a clean list.
 *
 * Accepts both shapes on purpose: the admin forms post the raw textarea string,
 * while a caller holding an already-parsed list (the seed script, or a future
 * import) can post that instead.
 */
export function asInclusions(value: unknown): string[] {
  if (typeof value === 'string') return parseInclusions(value);
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}
