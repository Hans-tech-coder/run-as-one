/**
 * The client's runner list as a spreadsheet (CLIENT_RACE_PAGE_PLAN.md, Batch
 * 4): the race-kit release and shipping sheet. Exactly the columns the screen
 * holds (`client-runners.ts`), so nothing leaves in the file that the page
 * did not already show. Quoting, formula neutralizing, phone-as-text and the
 * BOM are the staff export's (`registrant-csv.ts`), so the file survives Excel
 * the same way — and a runner's name cannot run as a formula on the client's
 * machine any more than on staff's.
 */

import type { ClientRunnerRow } from '@/lib/client-runners';
import { csvField, csvPhone, downloadCsv, fileSlug } from '../../events/[id]/registrants/registrant-csv';
import { kitSummary } from '../../events/[id]/registrants/category-change-display';
import { kitNote } from './RunnerCells';

const HEADERS = [
  'Runner Ref', 'First Name', 'Last Name', 'Category', 'Changed From', 'Kit Changed', 'Shirt Size', 'Status', 'Race Kit',
  'Kit Note', 'Phone', 'Email', 'Home Address', 'Province', 'Delivery Area', 'Delivery Address',
];

export function buildRunnerCsv(rows: ClientRunnerRow[]): string {
  return [
    HEADERS.map(csvField).join(','),
    ...rows.map(row =>
      [
        csvField(row.ref),
        csvField(row.firstName),
        csvField(row.lastName),
        csvField(row.category),
        // Blank unless a category change moved the runner (CATEGORY_CHANGE_PLAN.md D7).
        csvField(row.changedFrom),
        csvField(row.kitChange ? kitSummary(row.kitChange) : ''),
        csvField(row.size),
        csvField(row.status),
        csvField(row.kit),
        // Blank unless staff switched the receipt between pickup and delivery.
        csvField(kitNote(row)),
        csvPhone(row.phone),
        csvField(row.email),
        csvField(row.homeAddress),
        csvField(row.province),
        csvField(row.deliveryArea),
        csvField(row.deliveryAddress),
      ].join(','),
    ),
  ].join('\r\n');
}

/** Named after the race, so a client with several races can tell the files apart. */
export function downloadRunnerCsv(csv: string, raceTitle: string): void {
  downloadCsv(csv, `runners_${fileSlug(raceTitle, 'race')}.csv`);
}
