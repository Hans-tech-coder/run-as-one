"use client";

import React, { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { FileDown } from 'lucide-react';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import './print-copy.css';

/**
 * A dashboard page on screen, and the copy the printer gets — the e-certificate
 * guide and a client's race page (CLIENT_RACE_PAGE_PLAN.md, Batch 2).
 *
 * The consent sheet's pattern (`registrants/[runnerId]/consent/PrintableSheet`):
 * the dashboard frame is a fixed-height scrolling shell that clips what is in
 * it, so hiding the frame for print would leave the page cut off at the first
 * screenful. A second copy is portalled straight onto `<body>`, hidden on
 * screen, and the print rules in print-copy.css show that copy alone.
 *
 * Unlike the consent sheet, the print copy is its own render (`print`), not
 * the same children twice: it carries a title block the screen does not need
 * (`PrintHead`), and ids of its own. It sets `data-theme="light"`, so the
 * dashboard's tokens resolve to their light values inside it and a dark-mode
 * user still saves a white, printable PDF. `className` names the copy, so a
 * page's own paper rules can be scoped to it.
 *
 * **The copy sits in a one-cell table.** The page's own margin is 0, which is
 * what stops the browser stamping its date, title and URL on every page (it
 * only does so into a margin), and a forwarded PDF reading "localhost:3000"
 * looks like a screenshot. The margin comes back as the table's empty header
 * and footer rows, which the browser repeats at the top and foot of every
 * printed page.
 */
export default function PrintableCopy({
  children,
  print,
  className,
}: {
  children: React.ReactNode;
  print: React.ReactNode;
  className: string;
}) {
  // False on the server and on the hydrating pass, true after: there is no
  // <body> to portal into until the page is in a browser.
  const mounted = useSyncExternalStore(noSubscription, () => true, () => false);

  return (
    <>
      {children}
      {mounted &&
        createPortal(
          <div className={`print-copy ${className}`} data-theme="light" aria-hidden="true">
            <table className="print-copy-frame" role="presentation">
              <thead>
                <tr><td><div className="print-copy-gap" /></td></tr>
              </thead>
              <tbody>
                <tr><td>{print}</td></tr>
              </tbody>
              <tfoot>
                <tr><td><div className="print-copy-gap" /></td></tr>
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
 * The title block at the top of a print copy, so a forwarded PDF explains
 * itself: the logo, what the document is, and whose and when.
 */
export function PrintHead({ id, title, line }: { id: string; title: string; line: string }) {
  return (
    <header className="print-head">
      <RunAsOneLogo className="print-head-logo" />
      <h1 id={id}>{title}</h1>
      <p>{line}</p>
    </header>
  );
}

/**
 * A page's print action. Named for what the person wants rather than "Print":
 * the reader it is for — a designer, a shirt supplier — has no account, so the
 * PDF is the point. The browser's dialog does the rest, with no PDF library.
 *
 * **It lives in the page, never in the dashboard header**, which stays the
 * page's title and nothing else. Where in the page is the page's call: the
 * certificate guide, which already has a right-hand column for its contents,
 * puts it there (`SavePdfAside`) and closes the page with `SavePdfPanel`
 * below `xl` (print-copy.css hides the panel from `xl` up); the race page,
 * a report with no column to spare, puts the bare button at the end of the
 * race's status line from a tablet up and `SavePdfPanel` on a phone, where
 * the printed sections end.
 *
 * `label` lets a page name what is saved when the screen holds more than the
 * paper does: the race page says "Save report as PDF", because its payouts
 * and runners are on screen but never printed.
 */
export function SavePdfButton({ label = 'Save as PDF' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-light">
      <FileDown size={16} aria-hidden="true" /> {label}
    </button>
  );
}

/** What the button does, said once wherever the button is. */
function SavePdfHint() {
  return (
    <p className="print-save-hint">
      Opens the print dialog. Choose &ldquo;Save as PDF&rdquo; as the destination, then send the
      file on.
    </p>
  );
}

/** The button over its hint, for the top of a page's right-hand column. */
export function SavePdfAside() {
  return (
    <div className="print-save">
      <SavePdfButton />
      <SavePdfHint />
    </div>
  );
}

/**
 * The same action as a quiet panel of its own, at the foot of the page below
 * `xl`. `note`, when given, says what the PDF holds, for a page that shows
 * more than it prints.
 */
export function SavePdfPanel({
  id,
  title,
  note,
  label,
}: {
  id: string;
  title: string;
  note?: string;
  label?: string;
}) {
  return (
    <section className="print-save-end" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {note && <p className="print-save-note">{note}</p>}
      <SavePdfHint />
      <SavePdfButton label={label} />
    </section>
  );
}
