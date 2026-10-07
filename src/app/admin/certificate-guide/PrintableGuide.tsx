"use client";

import React, { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { FileDown } from 'lucide-react';
import './certificate-guide.css';
import './guide-print.css';

/**
 * The guide on screen, and the copy the printer gets.
 *
 * The consent sheet's pattern (`registrants/[runnerId]/consent/PrintableSheet`):
 * the dashboard frame is a fixed-height scrolling shell that clips what is in
 * it, so hiding the frame for print would leave the guide cut off at the first
 * screenful. A second copy is portalled straight onto `<body>`, hidden on
 * screen, and the print rules in guide-print.css show that copy alone.
 *
 * Unlike the consent sheet, the print copy is its own render (`print`), not
 * the same children twice: it carries a title block the screen does not need,
 * a checklist of plain boxes for ticking by hand, and ids of its own. It sets
 * `data-theme="light"`, so the dashboard's tokens resolve to their light values
 * inside it and a dark-mode user still saves a white, printable PDF.
 *
 * **The copy sits in a one-cell table.** The page's own margin is 0, which is
 * what stops the browser stamping its date, title and URL on every page (it
 * only does so into a margin), and a forwarded PDF reading "localhost:3000"
 * looks like a screenshot. The margin comes back as the table's empty header
 * and footer rows, which the browser repeats at the top and foot of every
 * printed page.
 */
export default function PrintableGuide({
  children,
  print,
}: {
  children: React.ReactNode;
  print: React.ReactNode;
}) {
  // False on the server and on the hydrating pass, true after: there is no
  // <body> to portal into until the page is in a browser.
  const mounted = useSyncExternalStore(noSubscription, () => true, () => false);

  return (
    <>
      {children}
      {mounted &&
        createPortal(
          <div className="cert-guide-print-copy" data-theme="light" aria-hidden="true">
            <table className="cert-guide-print-frame" role="presentation">
              <thead>
                <tr><td><div className="cert-guide-print-gap" /></td></tr>
              </thead>
              <tbody>
                <tr><td>{print}</td></tr>
              </tbody>
              <tfoot>
                <tr><td><div className="cert-guide-print-gap" /></td></tr>
              </tfoot>
            </table>
          </div>,
          document.body,
        )}
    </>
  );
}

function noSubscription() {
  return () => {};
}

/**
 * The header's action. Named for what the person wants rather than "Print":
 * the designer they send it to has no account, so the PDF is the point. The
 * browser's dialog does the rest, with no PDF library.
 */
export function SaveGuideButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-light">
      <FileDown size={16} aria-hidden="true" /> Save as PDF
    </button>
  );
}
