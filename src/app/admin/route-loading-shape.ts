/**
 * What each dashboard page looks like, for the route fallback that stands in
 * for it while it loads.
 *
 * A `loading.tsx` cannot import the page it is waiting for, and one boundary
 * covers every page nested under it, so the fallback asks the URL (which a
 * navigation with a loading boundary commits straight away) and draws the
 * shape written down here: metric tiles, a toolbar and list, or panels and the
 * rows in them.
 *
 * **Both layouts are described.** `list` and `panels` are the page below `lg`
 * — the card list and the single column of fields a phone gets. `lg` is the
 * same page from `lg` up — the same toolbar in one row, and the data table the
 * cards stand in for. `AdminRouteLoading` renders both and lets
 * `.dash-mobile-only` / `.dash-desktop-only` pick, exactly as every real page
 * in the dashboard does.
 *
 * The phone numbers were measured at 390px and the `lg` numbers at 1680px, on
 * the real pages, so the page that arrives lands where its skeleton stood.
 * Keep an entry in step with its page: a page that gains a toolbar row, a
 * metric, a field or a column changes its line here in the same edit, or the
 * wait jumps when the page arrives, which is the one thing this file exists to
 * stop. A route with no `lg` block falls back to the defaults in
 * `AdminRouteLoading`, which suit a plain table.
 */
export type RouteShape = {
  /** Metric tiles across the top. Both layouts; `.metrics-grid` does the rest. */
  metrics?: number;
  /** A toolbar and card list, below `lg`. */
  list?: {
    /**
     * - `page`: on the page under its toolbar (the TanStack screens);
     * - `panel`: inside a panel whose first row is its toolbar (clients,
     *   communities, feedback);
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
  /** Form or text panels, top to bottom, below `lg`. */
  panels?: FormPanelShape[];
  /**
   * A client viewer's event cards (`.viewer-event-grid`), how many to draw.
   * The grid lays them out the same way at every width, so both layouts read
   * this one number.
   */
  eventCards?: number;
  /** The same page from `lg` up. */
  lg?: DesktopShape;
};

export type FormPanelShape = {
  /** Each field's height in px, from the measures below. */
  fields: number[];
  /** A settings-style action row under the fields. */
  actions?: boolean;
};

/**
 * A page from `lg` up. The desktop is not a wider phone: the toolbar's rows
 * unwrap into one, the cards become a table, and a form's fields pair up two
 * to a row, so each of those is measured again here rather than derived.
 */
export type DesktopShape = {
  /**
   * The toolbar's content height in the one row it unwraps into, and with it
   * anything that stands between the toolbar and the list (Activity's filter
   * grid and its sort line, with their gaps). As on a phone this is the height
   * inside the toolbar's own padding, so the skeleton adds that padding back.
   */
  toolbar?: number;
  /** The table the cards stand in for: its header row, one body row, and how many to draw. */
  table?: { head: number; row: number; rows: number };
  /** Panels, top to bottom. */
  panels?: DesktopPanelShape[];
};

/**
 * A row of a panel's content, 24px from the next. A plain number is a row that
 * spans the panel; `split` is a row `.form-grid` gives to two fields side by
 * side, at the taller of the two.
 */
export type DesktopRow = number | { h: number; split: true };

export type DesktopPanelShape = {
  /** Each row of the panel's content, top to bottom. */
  rows: DesktopRow[];
  /** A settings-style action row under the rows. */
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
 *
 * From `lg` up the same three panels are rows instead of fields, because
 * `.form-grid` pairs the halves: Basic Information is its title, its
 * description, two rows of two and the two upload boxes side by side;
 * Distance Categories is its type picker over the first category's card; Bank
 * Transfer Accounts is its line of small print, its empty box and its button.
 */
export const EVENT_FORM_SHAPE: RouteShape = {
  panels: [
    { fields: [FIELD, TEXTAREA, FIELD, FIELD, FIELD, FIELD, UPLOAD, UPLOAD] },
    { fields: [368, FIELD, FIELD, FIELD, 163, 159, 261] },
    { fields: [326] },
  ],
  lg: {
    panels: [
      { rows: [87, 183, { h: 87, split: true }, { h: 87, split: true }, { h: 241, split: true }] },
      { rows: [187, 845] },
      // The button under the empty box brings its own 24px of space, which is
      // the gap the skeleton already draws, so only its 29px is counted here.
      { rows: [40, 130, 29] },
    ],
  },
};

/** Search, the filter chips, then the primary button: three 40px rows. */
const THREE_ROW_TOOLBAR = 144;

/** Every dashboard toolbar is one 40px row inside its padding from `lg` up. */
const LG_TOOLBAR = 40;

/** A `.data-table`'s header and body rows (the Dashboard, clients, communities, feedback). */
const LG_PLAIN_TABLE = { head: 51, row: 54 };

/** The TanStack screens' table, which carries its own header styling. */
const LG_TANSTACK_HEAD = 53;

const EXACT: Record<string, RouteShape> = {
  // Three tiles, or four for `platform:manage` — see OVERVIEW_PLATFORM_METRICS.
  '/admin': {
    metrics: 3,
    list: { frame: 'titled-panel' },
    // The panel holds the five latest registrations, and only ever five.
    lg: { table: { ...LG_PLAIN_TABLE, rows: 5 } },
  },
  '/admin/events': {
    list: { frame: 'page', toolbar: THREE_ROW_TOOLBAR },
    lg: { toolbar: LG_TOOLBAR, table: { head: LG_TANSTACK_HEAD, row: 61, rows: 8 } },
  },
  '/admin/events/new': EVENT_FORM_SHAPE,
  '/admin/marketing': {
    metrics: 3,
    list: { frame: 'page', toolbar: THREE_ROW_TOOLBAR },
    // A promo row carries its code, its meter and its dates: 93px.
    lg: { toolbar: LG_TOOLBAR, table: { head: LG_TANSTACK_HEAD, row: 93, rows: 5 } },
  },
  '/admin/team': {
    metrics: 3,
    list: { frame: 'page', toolbar: THREE_ROW_TOOLBAR },
    lg: { toolbar: LG_TOOLBAR, table: { head: LG_TANSTACK_HEAD, row: 45, rows: 10 } },
  },
  // Search, the four filter pickers one to a row, the "Newest first" line and
  // the first day heading, all above the first card.
  '/admin/activity': {
    list: { frame: 'page', toolbar: 456 },
    // The 44px toolbar, the filter grid's 87 and the sort line's 20, with the
    // 16px gaps between them: one block above the day's table.
    lg: { toolbar: 167, table: { head: LG_TANSTACK_HEAD, row: 77, rows: 6 } },
  },
  '/admin/settings': {
    panels: [
      { fields: [FIELD, HINTED], actions: true },
      { fields: [FIELD, HINTED, FIELD], actions: true },
    ],
    // `.form-grid` pairs them: one row in the first panel, a full-width field
    // over a pair in the second.
    lg: {
      panels: [
        { rows: [{ h: 111, split: true }], actions: true },
        { rows: [87, { h: 111, split: true }], actions: true },
      ],
    },
  },
  // Search, then the status chips over two rows of 44px.
  '/admin/clients': {
    list: { frame: 'panel', toolbar: 152 },
    lg: { toolbar: LG_TOOLBAR, table: { ...LG_PLAIN_TABLE, rows: 8 } },
  },
  // Four money tiles over the races; search, then the four state chips
  // wrapping under it (ADMIN_MERGE_PLAN.md, Batch 6).
  '/admin/remittances': {
    metrics: 4,
    list: { frame: 'panel', toolbar: 152 },
    lg: { toolbar: LG_TOOLBAR, table: { ...LG_PLAIN_TABLE, rows: 8 } },
  },
  // Search, then Add a club's box and button stacked.
  '/admin/communities': {
    list: { frame: 'panel', toolbar: 166 },
    lg: { toolbar: LG_TOOLBAR, table: { ...LG_PLAIN_TABLE, rows: 8 } },
  },
  '/admin/feedback': {
    metrics: 3,
    list: { frame: 'panel', toolbar: THREE_ROW_TOOLBAR },
    lg: { toolbar: LG_TOOLBAR, table: { ...LG_PLAIN_TABLE, rows: 8 } },
  },
};

/**
 * The settlement breakdown's sentence and its nine lines: 489px at 390, where
 * the longer labels wrap, and 368px from `lg` up.
 */
const SETTLEMENT_BREAKDOWN = 489;
const LG_SETTLEMENT_BREAKDOWN = 368;

const PATTERNS: [RegExp, RouteShape][] = [
  [/^\/admin\/events\/[^/]+\/edit$/, EVENT_FORM_SHAPE],
  // Search, Filters, the two queue chips and Sort, then Export; Select All above the cards.
  [
    /^\/admin\/events\/[^/]+\/registrants$/,
    {
      list: { frame: 'page', toolbar: 240, selectAll: true },
      // A registrant's row carries the runner under the order ref: 69px.
      lg: { toolbar: LG_TOOLBAR, table: { head: LG_TANSTACK_HEAD, row: 69, rows: 7 } },
    },
  ],
  // One race's settlement: four tiles over the breakdown panel, whose nine
  // lines are drawn as one block.
  [
    /^\/admin\/remittances\/[^/]+$/,
    { metrics: 4, panels: [{ fields: [SETTLEMENT_BREAKDOWN] }], lg: { panels: [{ rows: [LG_SETTLEMENT_BREAKDOWN] }] } },
  ],
  [
    /^\/admin\/events\/[^/]+\/results$/,
    {
      list: { frame: 'page', toolbar: 192 },
      lg: { toolbar: LG_TOOLBAR, table: { head: LG_TANSTACK_HEAD, row: 61, rows: 8 } },
    },
  ],
];

/**
 * The Overview's tiles for somebody holding `platform:manage`: the three every
 * role sees, plus *Platform Fees Collected*. It was the super admin's tile
 * until the dashboards merged; Run As One now keeps that money itself.
 */
const OVERVIEW_PLATFORM_METRICS = 4;

/**
 * A client viewer's Overview (ADMIN_MERGE_PLAN.md, Batch 4, `ViewerDashboard`):
 * three count tiles over its event cards. How many races a client has is not
 * known while waiting, so three cards are drawn — a full row from `lg` up.
 */
const VIEWER_OVERVIEW_SHAPE: RouteShape = { metrics: 3, eventCards: 3 };

/**
 * What the person waiting can open, where that changes a page's shape:
 * `platform:manage`, and whether this is a client viewer, whose `/admin` is a
 * different page altogether.
 */
export type ShapeViewer = { platform: boolean; clientViewer?: boolean };

/** The shape to draw for a path, or null for the plain figure (a 404, anything unlisted). */
export function routeShape(pathname: string | null, viewer?: ShapeViewer): RouteShape | null {
  if (!pathname) return null;
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  if (path === '/admin' && viewer?.clientViewer) return VIEWER_OVERVIEW_SHAPE;
  if (path === '/admin' && viewer?.platform) {
    return { ...EXACT[path], metrics: OVERVIEW_PLATFORM_METRICS };
  }
  return EXACT[path] ?? PATTERNS.find(([pattern]) => pattern.test(path))?.[1] ?? null;
}
