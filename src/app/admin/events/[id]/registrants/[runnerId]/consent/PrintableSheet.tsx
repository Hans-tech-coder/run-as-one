"use client";

import React, { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import './consent-sheet.css';

/**
 * The consent sheet, on screen and on paper.
 *
 * On screen it sits inside the dashboard like any page. On paper it has to be
 * the only thing there — and the dashboard frame around it is a fixed-height,
 * scrolling shell that clips anything positioned inside it, so hiding the
 * frame with `visibility` would leave the sheet cut off at the first screenful.
 * A second copy is therefore portalled straight onto `<body>`, hidden on
 * screen, and the print rules in consent-sheet.css show that copy alone. Both
 * are the same server-rendered children, so they cannot say different things.
 */
export default function PrintableSheet({ children }: { children: React.ReactNode }) {
  // False on the server and on the hydrating pass, true after: there is no
  // <body> to portal into until the page is in a browser.
  const mounted = useSyncExternalStore(noSubscription, () => true, () => false);

  return (
    <>
      {children}
      {mounted && createPortal(<div className="consent-print-copy">{children}</div>, document.body)}
    </>
  );
}

function noSubscription() {
  return () => {};
}

/** The header's action. The browser's own dialog does the rest — no PDF library. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-light">
      <Printer size={16} aria-hidden="true" /> Print
    </button>
  );
}
