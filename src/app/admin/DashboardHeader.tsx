"use client";

import React, { createContext, useContext } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/**
 * The bar at the top of every dashboard page (DASHBOARD_SHELL_PLAN.md, Batch 3).
 *
 * **The shell owns it; the page only says what it is.** A page hands over its
 * title, the trail of pages above it and any action of its own, and this draws
 * the rest — including the bell and the account menu, which `DashboardShell`
 * supplies through context. Before this, each of 25 pages drew its own
 * `.admin-header` and the tools floated over it from a zero-height slot, with a
 * `ResizeObserver` writing their width to `--dash-accessory-w` so every header
 * could pad itself clear of them. It worked, but a new page had to remember it.
 * Now the tools are a flex item in the same row, so the title gives way to them
 * by layout alone and there is nothing to measure.
 *
 * **Breadcrumbs replace the back arrow.** The dashboard is three levels deep in
 * places (`Events › Pink Run 2026 › Registrants › Guardian Consent`), and the
 * lone arrow said where "back" went only in its tooltip. `crumbs` are the
 * ancestors, outermost first; the page itself is the `<h1>` under them, so the
 * trail never repeats the title. A crumb with no `href` is a place with no page
 * of its own — an event is reached through its Edit, Pacers, Registrants and
 * Results screens, never at `/admin/events/[id]` — and is drawn as plain text,
 * not as a link that goes nowhere. The trail is the same at every width: a long
 * event name ellipsises rather than being dropped on a phone.
 *
 * `loading` draws the title as a pulsing bar, for `AdminRouteLoading`: the one
 * thing about the next page whose shape is already known.
 */

export type DashboardCrumb = { label: string; href?: string };

const HeaderToolsContext = createContext<React.ReactNode>(null);

/** Set by `DashboardShell`: what sits at the right end of every header. */
export const HeaderToolsProvider = HeaderToolsContext.Provider;

export default function DashboardHeader({
  title,
  crumbs,
  actions,
  loading = false,
}: {
  title?: React.ReactNode;
  crumbs?: DashboardCrumb[];
  /** The page's own controls, such as the consent sheet's Print button. */
  actions?: React.ReactNode;
  loading?: boolean;
}) {
  const tools = useContext(HeaderToolsContext);

  return (
    <header className="admin-header">
      <div className="admin-header-lead">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb">
            <ol className="dash-crumbs">
              {crumbs.map((crumb, index) => (
                <li key={`${index}-${crumb.label}`} className="dash-crumb">
                  {crumb.href ? (
                    <Link href={crumb.href} className="dash-crumb-link">{crumb.label}</Link>
                  ) : (
                    <span className="dash-crumb-text">{crumb.label}</span>
                  )}
                  <ChevronRight size={14} className="dash-crumb-sep" aria-hidden="true" />
                </li>
              ))}
            </ol>
          </nav>
        )}
        {loading ? (
          <div className="t-skel-skeleton is-pulsing" aria-hidden="true">
            <div className="t-skel-bar" style={{ width: '180px', height: '20px' }} />
          </div>
        ) : (
          <h1 className="admin-header-title">{title}</h1>
        )}
      </div>
      {actions && <div className="admin-header-actions">{actions}</div>}
      {tools && <div className="dash-header-tools">{tools}</div>}
    </header>
  );
}
