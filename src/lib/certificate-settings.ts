/**
 * What an event's certificate settings mean, and which of the two layouts an
 * organizer's template is drawn in.
 *
 * They live in `Event.certificateCoordinates`, a JSON string, so the designed
 * layout needed no migration. Two shapes share the column:
 *
 * - **Designed** (`{ v: 2, … }`): the template is artwork only and the app draws
 *   the whole content block — the default certificate's typography — inside the
 *   content area `top`..`bottom`, with the organizer's accent, the fields they
 *   chose and the "e-certificate by Run As One" byline.
 * - **Legacy** (`{ nameY, timeY, catY }`, or anything unreadable): the original
 *   three plain lines at those heights. Every event saved before the designed
 *   layout existed carries this shape, and it is drawn exactly as before until
 *   an admin switches the event over, so no runner's certificate changes under
 *   them.
 *
 * The default certificate (no template) ignores these settings entirely.
 */

export type CertificateInk = 'auto' | 'dark' | 'light';
export type BylinePosition = 'center' | 'right' | 'left';

export interface CertificateFields {
  /** "Certificate of Completion". Off when the template already says it. */
  title: boolean;
  /** The event's name. Off when the template already says it. */
  eventTitle: boolean;
  /** The event's day and place under its name. */
  eventDetails: boolean;
  category: boolean;
  bib: boolean;
  /**
   * The rank tile: place in the gender division, with the overall (category)
   * place under it. Settings saved before the two ranks shared a tile carry
   * `overallRank` / `genderRank` instead; either one on reads as this on.
   */
  rank: boolean;
}

export interface DesignedCertificateSettings {
  v: 2;
  /** The content area, as percentages of the page's height from the top. */
  top: number;
  bottom: number;
  ink: CertificateInk;
  /** The organizer's accent as `#rrggbb`, or '' for Run As One orange. */
  accent: string;
  fields: CertificateFields;
  byline: BylinePosition;
  /**
   * The byline's baseline, as a percentage of the page height up from the
   * bottom edge. 5.5 sits inside the guide's 5% safe margin, clear of a
   * border drawn near the edge; a template whose sponsors run lower than the
   * guide asks can take it down to the very foot.
   */
  bylineBottom: number;
}

export interface LegacyCertificateSettings {
  v: 1;
  nameY: number;
  timeY: number;
  catY: number;
}

export type CertificateSettings = DesignedCertificateSettings | LegacyCertificateSettings;

export const DEFAULT_FIELDS: CertificateFields = {
  title: true,
  eventTitle: true,
  eventDetails: true,
  category: true,
  bib: true,
  rank: false,
};

export const DEFAULT_DESIGNED_SETTINGS: DesignedCertificateSettings = {
  v: 2,
  top: 24,
  bottom: 72,
  ink: 'auto',
  accent: '',
  fields: DEFAULT_FIELDS,
  byline: 'center',
  bylineBottom: 5.5,
};

/**
 * Where the byline sat before it could be moved. Designed settings saved then
 * carry no `bylineBottom`, and read as this so a certificate an organizer
 * already approved keeps its byline where they saw it.
 */
const FIRST_BYLINE_BOTTOM = 4;

/** How low and how high the byline may sit, in percent of the page height. */
export const BYLINE_BOTTOM_RANGE = { min: 2, max: 15 } as const;

/** The narrowest content area allowed, so the block never collapses to nothing. */
export const MIN_CONTENT_SPAN = 20;

/**
 * Starting points for the content area, matching the two kinds of template the
 * client guide describes. Sponsors are optional: a template with a sponsor
 * band keeps the block above it (the default), and a clean one gives the block
 * the same room it has on Run As One's own certificate (488pt..112pt of a
 * 595pt page, so about 18%..81%).
 */
export const CONTENT_AREA_PRESETS = [
  { id: 'sponsors', label: 'With sponsors', hint: 'Logos along the bottom', top: 24, bottom: 72 },
  { id: 'clean', label: 'Clean template', hint: 'No sponsor band', top: 18, bottom: 82 },
] as const;

const LEGACY_DEFAULTS: LegacyCertificateSettings = { v: 1, nameY: 50, timeY: 60, catY: 70 };

const HEX = /^#[0-9a-f]{6}$/i;

const clampPct = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
};

/** Reads the column. Anything that is not a designed layout is legacy. */
export function parseCertificateSettings(raw: string | null | undefined): CertificateSettings {
  let data: Record<string, unknown> = {};
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') data = parsed;
  } catch {}

  if (data.v !== 2) {
    return {
      v: 1,
      nameY: clampPct(data.nameY, LEGACY_DEFAULTS.nameY),
      timeY: clampPct(data.timeY, LEGACY_DEFAULTS.timeY),
      catY: clampPct(data.catY, LEGACY_DEFAULTS.catY),
    };
  }

  const d = DEFAULT_DESIGNED_SETTINGS;
  let top = clampPct(data.top, d.top);
  let bottom = clampPct(data.bottom, d.bottom);
  if (bottom - top < MIN_CONTENT_SPAN) {
    top = d.top;
    bottom = d.bottom;
  }
  const fields = (data.fields && typeof data.fields === 'object' ? data.fields : {}) as Record<string, unknown>;
  if (typeof fields.rank !== 'boolean' && (fields.overallRank === true || fields.genderRank === true)) {
    fields.rank = true;
  }
  return {
    v: 2,
    top,
    bottom,
    ink: data.ink === 'dark' || data.ink === 'light' ? data.ink : 'auto',
    accent: typeof data.accent === 'string' && HEX.test(data.accent) ? data.accent.toLowerCase() : '',
    fields: Object.fromEntries(
      Object.entries(DEFAULT_FIELDS).map(([key, fallback]) => [
        key,
        typeof fields[key] === 'boolean' ? fields[key] : fallback,
      ]),
    ) as unknown as CertificateFields,
    byline: data.byline === 'right' || data.byline === 'left' ? data.byline : 'center',
    bylineBottom: Math.min(BYLINE_BOTTOM_RANGE.max, Math.max(BYLINE_BOTTOM_RANGE.min,
      data.bylineBottom == null ? FIRST_BYLINE_BOTTOM
        : Number.isFinite(Number(data.bylineBottom)) ? Number(data.bylineBottom) : d.bylineBottom)),
  };
}

/** What the column stores for these settings. */
export function serializeCertificateSettings(settings: CertificateSettings): string {
  if (settings.v === 1) {
    const { nameY, timeY, catY } = settings;
    return JSON.stringify({ nameY, timeY, catY });
  }
  return JSON.stringify(settings);
}

/** The settings a new event, or one never given any, starts with. */
export const defaultCertificateSettingsJson = () => serializeCertificateSettings(DEFAULT_DESIGNED_SETTINGS);
