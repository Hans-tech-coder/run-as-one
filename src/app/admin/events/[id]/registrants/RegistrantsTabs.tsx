"use client";

/**
 * The registrants screen's two tabs: "Registrants" and "Unpaid checkouts"
 * (UNPAID_ORDERS_PLAN.md Batch 3).
 *
 * An unpaid online checkout is never called a registrant (the owner's ruling,
 * `unpaidCheckoutWhere` in lib/pending-expiry.ts), so it gets its own tab
 * rather than a filter on the registrants table. A filter would put these
 * orders in the table's count, its selection and its CSV export, which is the
 * mix-up the plan exists to end.
 *
 * The tab is kept in the URL (`?tab=unpaid`), so the "+N unpaid" links on the
 * events table and the overview open it directly. Switching writes the URL
 * with `history.replaceState` rather than a navigation: both lists are already
 * on the page, so there is nothing to fetch. Both panels stay mounted and the
 * other one is `hidden`, so the registrants table keeps its search, filters
 * and page while staff look at the other tab.
 *
 * The bar is the team screen's sliding tabs (`.t-tabs`), placed the way
 * NotificationsCenter places its own.
 */

import React, { useId, useLayoutEffect, useRef, useState } from 'react';

export type RegistrantsTab = 'registrants' | 'unpaid' | 'refunds';

export default function RegistrantsTabs({
  initialTab,
  registrantCount,
  unpaidCount,
  refundCount,
  registrants,
  unpaid,
  refunds,
}: {
  initialTab: RegistrantsTab;
  /** Runners on the Registrants tab: paid, and bank transfers awaiting verification. */
  registrantCount: number;
  /** Runners on online checkouts still awaiting payment, the same number as "+N unpaid". */
  unpaidCount: number;
  /** Runners refunded on this race; null hides the tab from whoever may not refund. */
  refundCount: number | null;
  registrants: React.ReactNode;
  unpaid: React.ReactNode;
  refunds: React.ReactNode;
}) {
  const id = useId();
  const [tab, setTab] = useState<RegistrantsTab>(initialTab);
  const pillRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef(new Map<RegistrantsTab, HTMLButtonElement>());
  const placed = useRef(false);

  useLayoutEffect(() => {
    const pill = pillRef.current;
    const button = tabRefs.current.get(tab);
    if (!pill || !button) return;
    if (!placed.current) pill.style.transition = 'none';
    // Height as well as width: on a phone the two tabs share the bar's width
    // and a label may wrap onto a second line (.registrants-tabs in Admin.css).
    pill.style.transform = `translate(${button.offsetLeft - 3}px, ${button.offsetTop - 3}px)`;
    pill.style.width = `${button.offsetWidth}px`;
    pill.style.height = `${button.offsetHeight}px`;
    if (!placed.current) {
      void pill.offsetWidth;
      pill.style.transition = '';
      placed.current = true;
    }
  }, [tab]);

  const choose = (next: RegistrantsTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next !== 'registrants') url.searchParams.set('tab', next);
    else url.searchParams.delete('tab');
    window.history.replaceState(null, '', url);
  };

  const options: { value: RegistrantsTab; label: string }[] = [
    { value: 'registrants', label: `Registrants (${registrantCount.toLocaleString('en-US')})` },
    { value: 'unpaid', label: `Unpaid checkouts (${unpaidCount.toLocaleString('en-US')})` },
    ...(refundCount === null
      ? []
      : [{ value: 'refunds' as const, label: `Refunds (${refundCount.toLocaleString('en-US')})` }]),
  ];

  return (
    <div className="flex flex-col gap-4 w-full">
      <div
        role="tablist"
        aria-label="Show"
        className="t-tabs registrants-tabs"
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const at = options.findIndex(option => option.value === tab);
          const last = options.length - 1;
          const nextIndex =
            event.key === 'Home' ? 0 : event.key === 'End' ? last : event.key === 'ArrowLeft' ? (at === 0 ? last : at - 1) : at === last ? 0 : at + 1;
          const next = options[nextIndex].value;
          choose(next);
          tabRefs.current.get(next)?.focus();
        }}
      >
        <span ref={pillRef} className="t-tabs-pill" aria-hidden="true" />
        {options.map(option => (
          <button
            key={option.value}
            ref={element => {
              if (element) tabRefs.current.set(option.value, element);
              else tabRefs.current.delete(option.value);
            }}
            id={`${id}-tab-${option.value}`}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            aria-controls={`${id}-panel-${option.value}`}
            tabIndex={tab === option.value ? 0 : -1}
            className="t-tab"
            onClick={() => choose(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {options.map(option => (
        <div
          key={option.value}
          id={`${id}-panel-${option.value}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${option.value}`}
          hidden={tab !== option.value}
        >
          {option.value === 'registrants' ? registrants : option.value === 'unpaid' ? unpaid : refunds}
        </div>
      ))}
    </div>
  );
}
