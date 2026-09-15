import React from 'react';
import { Check } from 'lucide-react';

/**
 * The one card list of the dashboards — what a data table becomes below `lg`.
 *
 * A table does not fit a phone. Scrolling it sideways hides the columns that
 * matter behind the ones that do not, so every table in `/admin` and
 * `/superadmin` has a card list beside it instead. Both are rendered, and
 * `.dash-desktop-only` / `.dash-mobile-only` in `Admin.css` decide which one is
 * seen. That is CSS rather than a `matchMedia` hook on purpose: a hook
 * renders the wrong layout on the server and then swaps it after hydration,
 * while CSS is right on the first paint.
 *
 * **The cards read the same rows as the table.** A TanStack screen passes
 * `table.getRowModel().rows` and reads `row.original`, with selection through
 * `row.getIsSelected()` / `row.toggleSelected()`, so search, filter chips,
 * sort, selection and the pager stay shared and the two layouts cannot drift.
 * Only the body is swapped; the toolbar and pager above and below stay. The
 * superadmin's plain arrays fit the same props, which is why nothing here
 * knows about TanStack.
 *
 * Because both layouts are in the page at once, nothing in a card may carry an
 * `id` (the table already owns it), and state that belongs to a row — a batch
 * that is expanded, a disclosure that is open — lives in the parent, so it
 * survives a resize across `lg`.
 *
 * No `"use client"`: it holds no state, so a server page such as the
 * Dashboard can render it directly, and a client screen imports it as its own.
 */

export type AdminCardField = {
  label: string;
  value: React.ReactNode;
  /** Spans both columns — for a value too long to share a row (an event title, an email). */
  full?: boolean;
};

export type AdminCardSelection<T> = {
  isSelected: (item: T) => boolean;
  toggle: (item: T) => void;
  /** The checkbox's accessible name, e.g. "Select JUAN DELA CRUZ". */
  label: (item: T) => string;
};

export type AdminCardListProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  title: (item: T) => React.ReactNode;
  subtitle?: (item: T) => React.ReactNode;
  badges?: (item: T) => React.ReactNode;
  fields: (item: T) => AdminCardField[];
  /** Footer controls. A row menu stays portalled, as it is in the table. */
  actions?: (item: T) => React.ReactNode;
  selection?: AdminCardSelection<T>;
  /** Before the title — a table's `No.` column. */
  leading?: (item: T) => React.ReactNode;
  /** What opens under a row that opens (voucher batches, a feedback message). */
  expanded?: (item: T) => React.ReactNode;
  /** Shown instead of the list when there are no items. */
  empty?: React.ReactNode;
  /** Names the list for a screen reader, e.g. "Recent registrations". */
  label?: string;
  /**
   * Extra classes on the list. `is-flush` drops the list's own inset, for a
   * list that stands on the page between a toolbar and a pager rather than
   * inside a panel.
   */
  className?: string;
};

/** A render callback may hand back null or false to mean "nothing here". */
function hasContent(node: React.ReactNode) {
  return node !== null && node !== undefined && node !== false && node !== '';
}

export default function AdminCardList<T>({
  items,
  getKey,
  title,
  subtitle,
  badges,
  fields,
  actions,
  selection,
  leading,
  expanded,
  empty,
  label,
  className,
}: AdminCardListProps<T>) {
  if (items.length === 0) return <>{empty ?? null}</>;

  return (
    <ul className={`admin-card-list ${className ?? ''}`} aria-label={label}>
      {items.map((item) => {
        const isSelected = selection?.isSelected(item) ?? false;
        const cardSubtitle = subtitle?.(item);
        const cardBadges = badges?.(item);
        const cardActions = actions?.(item);
        const cardExpanded = expanded?.(item);
        const cardFields = fields(item);

        return (
          <li key={getKey(item)} className={`admin-card ${isSelected ? 'is-selected' : ''}`}>
            <div className="admin-card-head">
              {selection && (
                // The label is the 44px target; the box inside keeps the
                // table's 16px checkbox so the two layouts look like one.
                <label className="admin-card-select">
                  <span className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => selection.toggle(item)}
                      aria-label={selection.label(item)}
                      className="appearance-none w-4 h-4 rounded border border-white/20 bg-transparent checked:bg-white checked:border-white cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
                    />
                    {isSelected && (
                      <Check className="absolute text-black pointer-events-none" size={12} strokeWidth={3} />
                    )}
                  </span>
                </label>
              )}

              {leading && <div className="admin-card-leading">{leading(item)}</div>}

              <div className="admin-card-heading">
                <div className="admin-card-title">{title(item)}</div>
                {hasContent(cardSubtitle) && <div className="admin-card-subtitle">{cardSubtitle}</div>}
              </div>
            </div>

            {hasContent(cardBadges) && <div className="admin-card-badges">{cardBadges}</div>}

            {cardFields.length > 0 && (
              <dl className="admin-card-fields">
                {cardFields.map((field) => (
                  <div
                    key={field.label}
                    className={`admin-card-field ${field.full ? 'is-full' : ''}`}
                  >
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {hasContent(cardExpanded) && <div className="admin-card-expanded">{cardExpanded}</div>}

            {hasContent(cardActions) && <div className="admin-card-actions">{cardActions}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The card list's shape while its rows are still on their way, for a route's
 * `loading.tsx` below `lg`. It is built from the same `.admin-card` boxes, so
 * the list that arrives lands in the frame already on screen instead of
 * pushing it down. The pulse is `.t-skel` (transitions.dev 14), the same one
 * the header's title bar wears in AdminRouteLoading.
 */
export function AdminCardListSkeleton({
  cards = 3,
  fields = 2,
  className,
}: {
  cards?: number;
  /** Rows of two-up fields per card. */
  fields?: number;
  className?: string;
}) {
  return (
    <ul className={`admin-card-list ${className ?? ''}`} aria-hidden="true">
      {Array.from({ length: cards }, (_, card) => (
        <li key={card} className="admin-card">
          <div className="t-skel-skeleton is-pulsing flex flex-col gap-3">
            <div className="t-skel-bar" style={{ width: '70%', height: '18px' }} />
            <div className="t-skel-bar" style={{ width: '5rem', height: '22px', borderRadius: '999px' }} />
            {Array.from({ length: fields }, (_, row) => (
              <div key={row} className="t-skel-bar" style={{ width: '100%', height: '36px' }} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
