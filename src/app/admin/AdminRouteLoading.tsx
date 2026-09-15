import React from "react";
import LoadingDots from "@/components/ui/LoadingDots";
import { AdminCardListSkeleton } from "./AdminCardList";
import type { FormPanelShape, RouteShape } from "./route-loading-shape";

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
 * short line of text in a fixed spot. The dots below it are the part that says
 * the click was heard.
 *
 * **Below `lg`, given a `shape`, it draws the page instead of the dots.** A
 * phone's page is several screens of metric tiles, cards or form fields, and a
 * centred row of dots in their place made the whole screen jump when they
 * arrived. The loading files look the shape up by URL
 * (`route-loading-shape.ts`); without one, and on the desktop, it is the dots.
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
        <div className="admin-content">
          <div className="dash-desktop-only admin-route-loading">
            <LoadingDots size="lg" label="Loading this page" />
          </div>

          <div className="dash-mobile-only">
            <span className="sr-only" role="status">Loading this page</span>
            <ShapeSkeleton shape={shape} />
          </div>
        </div>
      ) : (
        <div className="admin-content admin-route-loading">
          <LoadingDots size="lg" label="Loading this page" />
        </div>
      )}
    </>
  );
}

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
            <div key={tile} className="metric-card">
              {/* The title row is the 36px icon box tall; the value 36px. */}
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
            <div
              key={field}
              className="t-skel-skeleton is-pulsing flex flex-col gap-2"
              style={{ height: `${height}px` }}
            >
              <div className="t-skel-bar" style={{ width: "35%", height: "14px", margin: "3px 0" }} />
              <div className="t-skel-bar" style={{ flex: 1 }} />
            </div>
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
