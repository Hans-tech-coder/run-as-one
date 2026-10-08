/**
 * The client's runner list as a spreadsheet (CLIENT_RACE_PAGE_PLAN.md, Batch
 * 4): the race-kit release and shipping sheet. Exactly the columns the screen
 * holds (`client-runners.ts`), so nothing leaves in the file that the page
 * did not already show. Quoting, phone-as-text and the BOM are the staff
 * export's (`registrant-csv.ts`), so the file survives Excel the same way.
 */

import type { ClientRunnerRow } from '@/lib/client-runners';
import { csvField, csvPhone, downloadCsv } from '../../events/[id]/registrants/registrant-csv';

const HEADERS = [
  'Runner Ref', 'First Name', 'Last Name', 'Category', 'Shirt Size', 'Status', 'Race Kit',
  'Phone', 'Email', 'Home Address', 'Province', 'Delivery Area', 'Delivery Address',
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
        csvField(row.size),
        csvField(row.status),
        csvField(row.kit),
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
  const slug = raceTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'race';
  downloadCsv(csv, `runners_${slug}.csv`);
}
