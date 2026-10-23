/**
 * A finished race's photo albums: the links an organizer posts so runners can
 * find their photos (PAST_EVENTS_PLAN.md D7, widened by the owner on
 * 2026-10-23 from one link to a list).
 *
 * The rule this module owns: an album is an https:// link of at most 500
 * characters with an optional name, and a race has at most five. One race
 * often has several — a page per volunteer photographer, the finish line
 * apart from the route, a Facebook set beside a Drive folder of full-size
 * files — and any platform is fine, so nothing here knows Facebook from
 * Flickr except `albumName`, which only names an unnamed link.
 *
 * The column (Event.photoAlbums) is JSON, so nothing in the database stops a
 * bad shape: the edit route writes through `readPhotoAlbums`, which refuses a
 * bad entry by number, and every read goes through `cleanPhotoAlbums`, so a
 * malformed row shows fewer buttons rather than a crash.
 *
 * https only because each link is shown to the public as a button, and
 * `javascript:` or plain `http:` behind it is not something this site should
 * hand a runner.
 */

export type PhotoAlbum = {
  url: string;
  /** What the album is ("Finish line", "JM Photography"). Empty is named from its site. */
  label: string;
};

/** Enough for every photographer a race plausibly has, few enough to scan as buttons. */
export const MAX_PHOTO_ALBUMS = 5;

export const MAX_PHOTO_ALBUM_URL = 500;

export const MAX_PHOTO_ALBUM_LABEL = 60;

function isAlbumLink(url: string): boolean {
  if (url.length > MAX_PHOTO_ALBUM_URL) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** The list as stored and shown: valid links only, names trimmed and capped, in the organizer's order. */
export function cleanPhotoAlbums(value: unknown): PhotoAlbum[] {
  if (!Array.isArray(value)) return [];
  const out: PhotoAlbum[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { url, label } = item as Record<string, unknown>;
    if (typeof url !== 'string' || !isAlbumLink(url.trim())) continue;
    out.push({
      url: url.trim(),
      label: typeof label === 'string' ? label.trim().slice(0, MAX_PHOTO_ALBUM_LABEL) : '',
    });
    if (out.length === MAX_PHOTO_ALBUMS) break;
  }
  return out;
}

/**
 * The list as the edit form sent it: undefined keeps what is stored; rows
 * with neither a link nor a name are dropped (a blank row the organizer
 * added and left); anything else must hold. A refusal says which album, by
 * its number on the form, and what is wrong with it, so it can sit under
 * that row.
 */
export function readPhotoAlbums(
  value: unknown,
):
  | { ok: true; albums: PhotoAlbum[] | undefined }
  | { ok: false; error: string; index: number } {
  if (value === undefined) return { ok: true, albums: undefined };
  if (!Array.isArray(value)) return { ok: false, error: 'The photo albums could not be read. Reload the page and try again.', index: 0 };

  const albums: PhotoAlbum[] = [];
  for (let index = 0; index < value.length; index++) {
    const item = value[index] as Record<string, unknown> | null;
    const url = typeof item?.url === 'string' ? item.url.trim() : '';
    const label = typeof item?.label === 'string' ? item.label.trim() : '';
    if (!url && !label) continue;

    const which = `Album ${index + 1}`;
    if (!url) return { ok: false, error: `${which} has a name but no link. Paste its link, or clear the name.`, index };
    if (url.length > MAX_PHOTO_ALBUM_URL) {
      return { ok: false, error: `${which}'s link is ${url.length} characters long. Keep it to ${MAX_PHOTO_ALBUM_URL} or fewer.`, index };
    }
    let protocol = '';
    try {
      protocol = new URL(url).protocol;
    } catch {
      return { ok: false, error: `${which}'s link is not a web address. Paste the whole link, starting with https://.`, index };
    }
    if (protocol !== 'https:') return { ok: false, error: `${which}'s link must start with https://.`, index };
    if (label.length > MAX_PHOTO_ALBUM_LABEL) {
      return { ok: false, error: `${which}'s name is ${label.length} characters long. Keep it to ${MAX_PHOTO_ALBUM_LABEL} or fewer.`, index };
    }
    // The same link twice is one album, not a mistake worth stopping a save for.
    if (albums.some(album => album.url === url)) continue;
    albums.push({ url, label });
  }
  if (albums.length > MAX_PHOTO_ALBUMS) {
    return { ok: false, error: `A race can list up to ${MAX_PHOTO_ALBUMS} photo albums. Remove one.`, index: MAX_PHOTO_ALBUMS };
  }
  return { ok: true, albums };
}

/** Where an unnamed link lives, as a runner would say it. */
const SITE_NAMES: [RegExp, string][] = [
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'Facebook'],
  [/^drive\.google\.com$/, 'Google Drive'],
  [/^(photos\.google\.com|photos\.app\.goo\.gl)$/, 'Google Photos'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(flickr\.com|flic\.kr)$/, 'Flickr'],
];

/**
 * The button text for each album, in order: its name when it has one,
 * otherwise the site it is on ("Facebook", "Google Drive", or the bare host),
 * numbered when two unnamed links would otherwise read the same.
 */
export function albumNames(albums: PhotoAlbum[]): string[] {
  const names = albums.map(album => {
    if (album.label) return album.label;
    let host = '';
    try {
      host = new URL(album.url).hostname.replace(/^www\./, '');
    } catch {
      return 'Photos';
    }
    return SITE_NAMES.find(([pattern]) => pattern.test(host))?.[1] ?? host;
  });
  return names.map((name, i) =>
    names.filter(other => other === name).length > 1
      ? `${name} ${names.slice(0, i + 1).filter(other => other === name).length}`
      : name,
  );
}
