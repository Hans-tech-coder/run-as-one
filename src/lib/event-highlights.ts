/**
 * Event highlights: the posters an organizer shows off on the event page —
 * the race kit, the trophies, a tourist spot near the venue, the after party.
 *
 * This module owns the rule for what a stored highlight list may hold. The
 * column (Event.highlights) is JSON, so nothing in the database stops a bad
 * shape; every write goes through `cleanHighlights` and every read through it
 * too, so a malformed row renders as fewer posters rather than a crash.
 *
 * Replaces the single Event.raceKitImageUrl poster, which the
 * 20260929090000_event_highlights migration copied in as a "Race Kit" entry.
 */

export type EventHighlight = {
  /** The uploaded image, as /api/upload returned it. */
  url: string;
  /** What the poster shows ("Race Kit", "Trophies"). Empty shows no caption. */
  caption: string;
};

/** Enough for every poster an event plausibly has, small enough to scan. */
export const MAX_EVENT_HIGHLIGHTS = 12;

export const MAX_HIGHLIGHT_CAPTION = 60;

/** Suggestions for the caption field, not a closed list. */
export const HIGHLIGHT_CAPTION_EXAMPLES = 'e.g. Race Kit, Trophies, Venue, After Party';

/**
 * The list as it may be stored and shown: only entries with an image URL,
 * captions trimmed and capped, at most MAX_EVENT_HIGHLIGHTS, in the order
 * given (the organizer's order is the page's order).
 */
export function cleanHighlights(value: unknown): EventHighlight[] {
  if (!Array.isArray(value)) return [];
  const out: EventHighlight[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { url, caption } = item as Record<string, unknown>;
    if (typeof url !== 'string' || !/^(https?:\/\/|\/)/.test(url.trim())) continue;
    out.push({
      url: url.trim(),
      caption: typeof caption === 'string' ? caption.trim().slice(0, MAX_HIGHLIGHT_CAPTION) : '',
    });
    if (out.length === MAX_EVENT_HIGHLIGHTS) break;
  }
  return out;
}
