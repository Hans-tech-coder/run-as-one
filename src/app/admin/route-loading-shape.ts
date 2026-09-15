/**
 * What each dashboard page looks like below `lg`, for the route fallback that
 * stands in for it while it loads.
 *
 * A `loading.tsx` cannot import the page it is waiting for, and one boundary
 * covers every page nested under it, so the fallback asks the URL (which a
 * navigation with a loading boundary commits straight away) and draws the
 * shape written down here: metric tiles, a toolbar and card list and what they
 * stand in, or form panels and the fields in them. Only the phone and tablet
 * layout is described. From `lg` up every fallback is the centred dots, as it
 * always was.
 *
 * The numbers were measured on the real pages at 390px, so the list and the
 * fields that arrive land where their skeletons stood. Keep an entry in step
 * with its page: a page that gains a toolbar row, a metric or a field changes
 * its line here in the same edit, or the wait jumps when the page arrives,
 * which is the one thing this file exists to stop.
 */
export type RouteShape = {
  /** Metric tiles across the top. */
  metrics?: number;
  /** A toolbar and card list. */
  list?: {
    /**
     * - `page`: on the page under its toolbar (the TanStack screens);
     * - `panel`: inside a panel whose first row is its toolbar (superadmin);
     * - `titled-panel`: inside a panel under a title (the Dashboard).
     */
    frame: 'page' | 'panel' | 'titled-panel';
    /**
     * The toolbar's content height on a phone, inside its padding: the search
     * row and every row of chips, forms and buttons that wraps under it.
     */
    toolbar?: number;
    /** A "Select all on this page" row above the cards. */
    selectAll?: boolean;
  };
  /** Form or text panels, top to bottom. */
  panels?: FormPanelShape[];
};

export type FormPanelShape = {
  /** Each field's height in px, from the measures below. */
  fields: number[];
  /** A settings-style action row under the fields. */
  actions?: boolean;
};

/* What a form panel holds, measured at 390px. */
/** A label over a one-line box. */
const FIELD = 87;
/** The same with a line of small print under it. */
const HINTED = 111;
/** A label over a five-row box. */
const TEXTAREA = 183;
/** A label over a drop zone. */
const UPLOAD = 219;

/**
 * The create and edit forms, as far down as a phone first shows and a little
 * past: Basic Information field by field, then the options panel (its type
 * picker, then the first option's fields) and the bank accounts panel. The edit
 * form reuses it for its own fetch, so the route's wait and the fetch's wait
 * are one screen.
 */
export const EVENT_FORM_SHAPE: RouteShape = {
  panels: [
    { fields: [FIELD, TEXTAREA, FIELD, FIELD, FIELD, FIELD, UPLOAD, UPLOAD] },
    { fields: [368, FIELD, FIELD, FIELD, 163, 159, 261] },
    { fields: [326] },
  ],
};

/** Search, the filter chips, then the primary button: three 40px rows. */
const THREE_ROW_TOOLBAR = 144;

const EXACT: Record<string, RouteShape> = {
  '/admin': { metrics: 3, list: { frame: 'titled-panel' } },
  '/admin/events': { list: { frame: 'page', toolbar: THREE_ROW_TOOLBAR } },
  '/admin/events/new': EVENT_FORM_SHAPE,
  '/admin/marketing': { metrics: 3, list: { frame: 'page', toolbar: THREE_ROW_TOOLBAR } },
  '/admin/team': { metrics: 3, list: { frame: 'page', toolbar: THREE_ROW_TOOLBAR } },
  '/admin/settings': {
    panels: [
      { fields: [FIELD, HINTED], actions: true },
      { fields: [FIELD, HINTED, FIELD], actions: true },
    ],
  },
  // The System Overview panel's two paragraphs.
  '/superadmin': { metrics: 4, panels: [{ fields: [256] }] },
  // Search, then the status chips over two rows of 44px.
  '/superadmin/organizers': { list: { frame: 'panel', toolbar: 152 } },
  // Search, then Add a club's box and button stacked.
  '/superadmin/communities': { list: { frame: 'panel', toolbar: 166 } },
  '/superadmin/feedback': { metrics: 3, list: { frame: 'panel', toolbar: THREE_ROW_TOOLBAR } },
};

const PATTERNS: [RegExp, RouteShape][] = [
  [/^\/admin\/events\/[^/]+\/edit$/, EVENT_FORM_SHAPE],
  // Search, Filters, the two queue chips and Sort, then Export; Select All above the cards.
  [/^\/admin\/events\/[^/]+\/registrants$/, { list: { frame: 'page', toolbar: 240, selectAll: true } }],
  [/^\/admin\/events\/[^/]+\/results$/, { list: { frame: 'page', toolbar: 192 } }],
];

/** The shape to draw for a path, or null for the plain dots (a 404, anything unlisted). */
export function routeShape(pathname: string | null): RouteShape | null {
  if (!pathname) return null;
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return EXACT[path] ?? PATTERNS.find(([pattern]) => pattern.test(path))?.[1] ?? null;
}
