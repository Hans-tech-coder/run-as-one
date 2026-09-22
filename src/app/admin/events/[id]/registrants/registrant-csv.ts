/**
 * The registrants export, written to survive Excel.
 *
 * Split out of `RegistrantsTable.tsx` so the column list is one readable
 * object rather than a hundred lines buried in a two-thousand-line component:
 * this file is what an organizer's race-day spreadsheet actually is, and
 * adding a column should not mean opening the table.
 *
 * Three things had to be true and were not:
 *
 *  - **Every field is quoted.** Only some of them used to be, so a runner
 *    named "DELA CRUZ, JR." or a category called "10K, Open" pushed every
 *    following column one to the right for that row alone — the kind of
 *    damage nobody notices until the race-day list is already printed.
 *  - **Phone numbers reach Excel as text.** `+639171234567` bare is read as
 *    a formula, because a leading `+` starts one, and lands in the cell as
 *    the number 639171234567 with the plus gone. The `="…"` form is the one
 *    spelling Excel, Google Sheets and LibreOffice all read back as the
 *    literal string.
 *  - **A UTF-8 BOM leads the file.** Without it Excel opens a UTF-8 CSV as
 *    the system codepage, and the first "Ñ" in a Filipino name arrives as
 *    mojibake.
 *
 * CRLF line endings for the same reason: RFC 4180 asks for them, and Excel
 * is the reader this file exists for.
 */

import { formatPesos } from '@/lib/money';

const csvField = (value: unknown): string =>
  `"${String(value ?? '').replace(/"/g, '""')}"`;

const csvPhone = (value: unknown): string => {
  const number = String(value ?? '').replace(/"/g, '');
  return number ? `"=""${number}"""` : csvField('');
};

export const REGISTRANT_CSV_HEADERS = [
  'Runner Ref', 'Order Ref', 'First Name', 'Last Name', 'Email', 'Phone', 'Gender', 'Birthdate',
  'Guardian Name', 'Guardian Relationship', 'Guardian Consent At',
  'Category', 'Distance', 'Shirt Size', 'Emergency Contact', 'Emergency Phone',
  'Running Community', 'Medical Conditions', 'Logistics Method', 'Delivery Area', 'Delivery Address',
  'Payment Method', 'Pacer', 'Promo Code', 'Order Discount', 'Order Total', 'Status'
];

/** One runner's line, in the order of `REGISTRANT_CSV_HEADERS`. */
function registrantCsvRow(runner: any): string {
  return [
    csvField(runner.runnerRef),
    csvField(runner.orderRef),
    csvField(runner.firstName),
    csvField(runner.lastName),
    csvField(runner.email),
    csvPhone(runner.phone),
    csvField(runner.gender),
    csvField(runner.birthdate),
    // Blank for a runner who needed none. A minor with none on file is
    // blank here too; the detail modal is where that is called out.
    csvField(runner.guardianName || ''),
    csvField(runner.guardianRelationshipLabel || ''),
    csvField(runner.guardianConsentAtLabel || ''),
    csvField(runner.category),
    csvField(runner.distance),
    csvField(runner.size),
    csvField(runner.emergencyContactName),
    csvPhone(runner.emergencyContactPhone),
    csvField(runner.runningCommunity),
    csvField(runner.medicalConditions || 'None'),
    csvField(runner.logisticsMethod),
    csvField(runner.deliveryZone),
    csvField(runner.deliveryAddress),
    csvField(runner.paymentMethod),
    // A column of its own rather than a word folded into Payment Method
    // (PACER_DISCOUNT_PLAN.md Batch 3). The organizer sorts this sheet to
    // build the kit-claiming list, and a pacer needs a bib and a singlet like
    // everyone else while their money column reads ₱0 — so it has to be
    // filterable, not merely mentioned. Blank rather than "NO", the way the
    // guardian columns are blank: an empty cell is the ordinary case.
    csvField(runner.isPacer ? 'YES' : ''),
    // The order's money, repeated on each of its runners. A group's five
    // rows carry the same three figures because they are one payment —
    // summing this column would double-count, and an organizer matching a
    // bank line needs the figure on whichever row they searched for.
    csvField(runner.promoCode || ''),
    csvField(runner.discountAmount ? formatPesos(runner.discountAmount) : ''),
    csvField(formatPesos(runner.totalAmount)),
    csvField(runner.status),
  ].join(',');
}

/** The whole file, header row included, ready to be handed to a Blob. */
export function buildRegistrantCsv(runners: any[]): string {
  return [
    REGISTRANT_CSV_HEADERS.map(csvField).join(','),
    ...runners.map(registrantCsvRow),
  ].join('\r\n');
}

/** Hands the built file to the browser as a download. */
export function downloadRegistrantCsv(csv: string, eventId: string): void {
  // U+FEFF, the byte order mark, spelled out rather than pasted in as the
  // invisible character it is. It has to be the very first thing in the file
  // or Excel reads the rest as the system codepage instead of UTF-8.
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM, csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `registrants_event_${eventId}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // The blob stays in memory for the life of the document otherwise, and an
  // organizer exports the same list over and over while checking payments.
  // Released on the next tick, not immediately: some browsers have not
  // finished handing the URL to the download manager when click() returns,
  // and revoking under them cancels the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
