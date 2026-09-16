import React from "react";
import RunnerLoader from "@/components/ui/RunnerLoader";
import { AdminCardListSkeleton } from "./AdminCardList";
import type {
  DesktopPanelShape,
  DesktopRow,
  DesktopShape,
  FormPanelShape,
  RouteShape,
} from "./route-loading-shape";

/**
 * What the dashboard shows while a page is being fetched.
 *
 * Every admin and superadmin page is built the same way — an `.admin-header`
 * with a title in it, then `.admin-content` — so the fallback is that same
 * frame with the answers still missing. Holding the header at its real 80px
 * and the content at a real height means the page that arrives fills the shape
 * already on screen instead of shunting it, which is the whole difference
 * between a wait that reads as progress and one that reads as a glitch.
 *
 * The title is a pulsing skeleton bar rather than the word "Loading", because
 * a title is the one thing about the next page whose shape is known: it is a
 * short line of text in a fixed spot.
 *
 * **Given a `shape`, it draws the page at every width.** A phone gets its
 * toolbar, its cards or its stacked fields; from `lg` up the same page gets its
 * toolbar in one row and the data table the cards stand in for. Both are
 * rendered and `.dash-mobile-only` / `.dash-desktop-only` pick between them,
 * the same switch every real page in the dashboard uses, so the first paint is
 * right on the server. The loading files look the shape up by URL
 * (`route-loading-shape.ts`); a route with no shape at all — a 404, anything
 * unlisted — is the centred running figure, which promises nothing about what
 * is coming.
 *
 * Used by `admin/loading.tsx`, `admin/events/loading.tsx` and
 * `superadmin/loading.tsx`, and by the edit form while it fetches its event.
 * No hooks, so a fallback that is a Server Component can still render it.
 */
export default function AdminRouteLoading({ shape }: { shape?: RouteShape | null }) {
  return (
    <>
      <header className="admin-header">
        <div className="t-skel-skeleton is-pulsing" aria-hidden="true">
          <div className="t-skel-bar" style={{ width: "180px", height: "20px" }} />
        </div>
      </header>

      {shape ? (
        <div className="admin-content is-route-loading">
          {/* One status for both layouts; only one of them is ever on screen. */}
          <span className="sr-only" role="status">Loading this page</span>

          <div className="dash-mobile-only">
            <ShapeSkeleton shape={shape} />
          </div>

          <div className="dash-desktop-only">
            <DesktopSkeleton shape={shape} />
          </div>
        </div>
      ) : (
        <div className="admin-content admin-route-loading">
          <RunnerLoader size="lg" label="Loading this page" />
        </div>
      )}
    </>
  );
}

/* ── Below `lg` ─────────────────────────────────────────────────────────── */

/**
 * The page's own furniture — `.metric-card`, `.admin-panel`, `.admin-toolbar`,
 * `.admin-card` — holding bars at the heights of what goes in them, so every
 * inset and gap is the real one. Bars sit directly inside their skeleton
 * layer, which is what makes `.t-skel` pulse them.
 */
function ShapeSkeleton({ shape }: { shape: RouteShape }) {
  const { list } = shape;

  return (
    <div aria-hidden="true">
      {shape.metrics ? (
        <div className="metrics-grid">
          {Array.from({ length: shape.metrics }, (_, tile) => (
            // Below `lg` the card's own gap is 8px and its value 1.5rem, so the
            // title row is the 36px icon box tall and the value 36px.
            <div key={tile} className="metric-card">
              <div className="t-skel-skeleton is-pulsing flex flex-col gap-2">
                <div className="t-skel-bar" style={{ width: "60%", height: "16px", margin: "10px 0" }} />
                <div className="t-skel-bar" style={{ width: "40%", height: "28px", margin: "4px 0" }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {list?.frame === "page" && (
        <>
          {/* The toolbar stands on the page with 16px under it. */}
          <div style={{ paddingBottom: "16px" }}>
            <ToolbarSkeleton height={list.toolbar ?? 40} />
          </div>
          {list.selectAll && (
            <div className="t-skel-skeleton is-pulsing flex items-center" style={{ height: "56px" }}>
              <div className="t-skel-bar" style={{ width: "45%", height: "20px" }} />
            </div>
          )}
          <div style={{ marginTop: "16px" }}>
            <AdminCardListSkeleton className="is-flush" />
          </div>
        </>
      )}

      {list?.frame === "panel" && (
        <div className="admin-panel">
          <div className="admin-toolbar">
            <ToolbarSkeleton height={list.toolbar ?? 40} />
          </div>
          <AdminCardListSkeleton />
        </div>
      )}

      {list?.frame === "titled-panel" && (
        <div className="admin-panel">
          <div className="admin-panel-header">
            <PanelTitle />
          </div>
          <AdminCardListSkeleton />
        </div>
      )}

      {shape.panels ? (
        // Under metric tiles a panel keeps the page's own 32px above it (the
        // superadmin dashboard's `mt-8`), collapsing with the grid's margin.
        <div className={`flex flex-col gap-8 ${shape.metrics ? "mt-8" : ""}`}>
          {shape.panels.map((panel, index) => (
            <FormPanel key={index} panel={panel} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A toolbar at its measured height: the 40px search row, then one block for
 * whatever wraps under it on a phone. The rows differ by screen (40px chips,
 * 44px chips, a stacked form), so the height is what is kept exact rather than
 * each row's outline.
 */
function ToolbarSkeleton({ height }: { height: number }) {
  return (
    <div className="t-skel-skeleton is-pulsing flex w-full flex-col gap-2" style={{ height: `${height}px` }}>
      <div className="t-skel-bar" style={{ width: "100%", height: "40px", flexShrink: 0 }} />
      {height > 48 && <div className="t-skel-bar" style={{ width: "100%", flex: 1 }} />}
    </div>
  );
}

/** A panel title's line box is 27px; the bar is drawn inside it. */
function PanelTitle() {
  return (
    <div className="t-skel-skeleton is-pulsing w-full">
      <div className="t-skel-bar" style={{ width: "45%", height: "19px", margin: "4px 0" }} />
    </div>
  );
}

/** A label over a box, at the height the two of them take together. */
function FieldSkeleton({ height }: { height: number }) {
  return (
    <div
      className="t-skel-skeleton is-pulsing flex flex-col gap-2"
      style={{ height: `${height}px` }}
    >
      <div className="t-skel-bar" style={{ width: "35%", height: "14px", margin: "3px 0" }} />
      <div className="t-skel-bar" style={{ flex: 1 }} />
    </div>
  );
}

/** A form panel: its title, then each field as a label over a box, 24px apart. */
function FormPanel({ panel }: { panel: FormPanelShape }) {
  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <PanelTitle />
      </div>
      <div className="admin-panel-content">
        <div className="flex flex-col gap-6">
          {panel.fields.map((height, field) => (
            <FieldSkeleton key={field} height={height} />
          ))}
        </div>
        {panel.actions && (
          // .settings-actions: 32px above, then the saved line and the button.
          <div
            className="t-skel-skeleton is-pulsing flex flex-col justify-end"
            style={{ marginTop: "32px", height: "113px" }}
          >
            <div className="t-skel-bar" style={{ width: "100%", height: "48px" }} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── From `lg` up ───────────────────────────────────────────────────────── */

/** What a screen's table looks like when its shape says nothing more precise. */
const LG_DEFAULTS = {
  toolbar: 40,
  /** The TanStack screens' bordered box. */
  page: { head: 53, row: 61, rows: 8 },
  /** A `.data-table` inside a panel. */
  plain: { head: 51, row: 54, rows: 8 },
};

/**
 * The same page from `lg` up: the metric tiles at their desktop height, the
 * toolbar in the one row it unwraps into, and the table the cards stand in for
 * — in the frame that screen really uses, a bordered box on the TanStack
 * screens and a `.data-table` inside a panel everywhere else.
 *
 * A screen whose shape carries no `lg` block still gets drawn, from the
 * defaults above; only a route with no shape at all falls back to the figure.
 */
function DesktopSkeleton({ shape }: { shape: RouteShape }) {
  const { list } = shape;
  const lg: DesktopShape = shape.lg ?? {};
  const plain = list?.frame !== "page";
  const table = lg.table ?? (plain ? LG_DEFAULTS.plain : LG_DEFAULTS.page);
  const toolbar = lg.toolbar ?? LG_DEFAULTS.toolbar;
  const panels = lg.panels ?? shape.panels?.map(panel => ({ rows: panel.fields, actions: panel.actions }));

  return (
    <div aria-hidden="true">
      {shape.metrics ? (
        <div className="metrics-grid">
          {Array.from({ length: shape.metrics }, (_, tile) => (
            // 24px of padding around a 36px title row, 16px of gap and a 48px
            // value: the 150px tile.
            <div key={tile} className="metric-card">
              <div className="t-skel-skeleton is-pulsing flex flex-col gap-4">
                <div className="t-skel-bar" style={{ width: "55%", height: "16px", margin: "10px 0" }} />
                <div className="t-skel-bar" style={{ width: "30%", height: "28px", margin: "10px 0" }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {list?.frame === "page" && (
        <>
          {/* The toolbar stands on the page with its own 16px under it, and
              the screen's own 16px of gap under that. */}
          <div style={{ paddingBottom: "16px" }}>
            <TopBarSkeleton height={toolbar} />
          </div>
          <div style={{ marginTop: "16px" }}>
            <TableSkeleton {...table} boxed />
          </div>
        </>
      )}

      {list?.frame === "panel" && (
        <div className="admin-panel">
          <div className="admin-toolbar">
            <TopBarSkeleton height={toolbar} />
          </div>
          <TableSkeleton {...table} />
        </div>
      )}

      {list?.frame === "titled-panel" && (
        <div className="admin-panel">
          <div className="admin-panel-header">
            <PanelTitle />
          </div>
          <TableSkeleton {...table} />
        </div>
      )}

      {panels ? (
        <div className={`flex flex-col gap-8 ${shape.metrics ? "mt-8" : ""}`}>
          {panels.map((panel, index) => (
            <DesktopPanel key={index} panel={panel} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The one row a toolbar becomes from `lg` up: the search box on the left and
 * the controls that sat under it on a phone now beside it, so the bar is drawn
 * as the two ends of a row rather than one block.
 */
function TopBarSkeleton({ height }: { height: number }) {
  return (
    <div
      className="t-skel-skeleton is-pulsing flex w-full items-center justify-between gap-4"
      style={{ height: `${height}px` }}
    >
      <div className="t-skel-bar" style={{ width: "22rem", maxWidth: "45%", height: "40px" }} />
      <div className="t-skel-bar" style={{ width: "14rem", maxWidth: "30%", height: "40px" }} />
    </div>
  );
}

/**
 * A table's frame with its rows still empty: the header band, then each row at
 * the height that screen's cells really take, divided by the same hairlines.
 * `boxed` is the TanStack screens' bordered, rounded box; without it the table
 * stands in a panel, where the panel's own border is the frame.
 */
function TableSkeleton({
  head,
  row,
  rows,
  boxed,
}: {
  head: number;
  row: number;
  rows: number;
  boxed?: boolean;
}) {
  return (
    <div className={boxed ? "border border-white/10 rounded-lg overflow-hidden" : "data-table-wrapper"}>
      <div
        className="t-skel-skeleton is-pulsing flex items-center px-4"
        style={{
          height: `${head}px`,
          background: "rgba(0, 0, 0, 0.2)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <div className="t-skel-bar" style={{ width: "30%", height: "12px" }} />
      </div>

      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="t-skel-skeleton is-pulsing flex items-center px-4"
          style={{
            height: `${row}px`,
            borderBottom: index === rows - 1 ? undefined : "1px solid rgba(255, 255, 255, 0.05)",
          }}
        >
          {/* The rows are not all one length, so the bars are not either. */}
          <div
            className="t-skel-bar"
            style={{ width: `${70 - (index % 3) * 8}%`, height: "16px" }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * A panel from `lg` up. The rows go in a real `.form-grid`, so a `split` row
 * is laid out by the same rule the form itself obeys — two columns from `md`
 * up — rather than by a width written here.
 */
function DesktopPanel({ panel }: { panel: DesktopPanelShape }) {
  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <PanelTitle />
      </div>
      <div className="admin-panel-content">
        {/* Each field is wrapped rather than dropped in bare: a
            `.t-skel-skeleton` is pinned to `grid-area: 1 / 1` so the reveal can
            stack its two layers, and a pair of them in a grid would land in the
            same cell. */}
        <div className="form-grid">
          {panel.rows.map((entry, index) => {
            const height = rowHeight(entry);
            return isSplit(entry) ? (
              <React.Fragment key={index}>
                <div><FieldSkeleton height={height} /></div>
                <div><FieldSkeleton height={height} /></div>
              </React.Fragment>
            ) : (
              <div key={index} className="form-group-full">
                <FieldSkeleton height={height} />
              </div>
            );
          })}
        </div>
        {panel.actions && (
          // .settings-actions: 32px above, then the saved line and the button
          // on one row, which is 73px from `lg` up.
          <div
            className="t-skel-skeleton is-pulsing flex items-center justify-between"
            style={{ marginTop: "32px", height: "73px" }}
          >
            <div className="t-skel-bar" style={{ width: "12rem", height: "20px" }} />
            <div className="t-skel-bar" style={{ width: "10rem", height: "48px" }} />
          </div>
        )}
      </div>
    </div>
  );
}

function isSplit(entry: DesktopRow) {
  return typeof entry !== "number" && entry.split;
}

function rowHeight(entry: DesktopRow) {
  return typeof entry === "number" ? entry : entry.h;
}
