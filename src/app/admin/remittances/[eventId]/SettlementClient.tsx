"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, FileText, Plus } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';
import AdminCardList from '@/app/admin/AdminCardList';
import { formatEventDayShort } from '@/lib/event-schedule';
import {
  describeRemittance,
  remittanceKindLabel,
  remittanceMethodLabel,
  formatSignedPesos,
} from '@/lib/settlement';
import type { RemittanceRow } from '@/lib/settlement-store';
import RecordRemittanceDialog from './RecordRemittanceDialog';
import VoidRemittanceDialog from './VoidRemittanceDialog';

/**
 * A race's remittances, and the two things that can be done about them:
 * record one, or void one (ADMIN_MERGE_PLAN.md, Batch 6).
 *
 * **Nothing here edits a remittance.** A wrong entry is voided with a reason
 * and the right one recorded, so the list keeps every line anyone wrote,
 * voided ones struck through with who voided them and why.
 *
 * After either write the page is refreshed (`router.refresh()`), so the
 * balance and the breakdown above are summed again by the server rather than
 * adjusted here — the screen never shows a figure the database would not.
 *
 * The receipt opens through `api/admin/remittances/[id]/proof` in a new tab,
 * as a runner's proof does, which records the opening.
 */

/** When a line was written, as Manila reads it. Explicit locale and zone, so server and browser agree. */
const recordedOn = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(iso),
  );

export default function SettlementClient({
  eventId,
  eventTitle,
  balance,
  today,
  remittances,
}: {
  eventId: string;
  eventTitle: string;
  balance: number;
  /** Manila's today, from the server, so the dialog's date and its check agree. */
  today: string;
  remittances: RemittanceRow[];
}) {
  const router = useRouter();
  const { toast } = useAlert();
  const [recording, setRecording] = useState(false);
  const [voiding, setVoiding] = useState<RemittanceRow | null>(null);

  const statusBadge = (row: RemittanceRow) =>
    row.status === 'VOIDED' ? (
      <span className="status-badge neutral">Voided</span>
    ) : (
      <span className="status-badge success">Recorded</span>
    );

  const voidLine = (row: RemittanceRow) =>
    row.status === 'VOIDED' ? (
      <span className="block text-xs text-secondary mt-1 [overflow-wrap:anywhere]">
        Voided by {row.voidedByName ?? 'someone'}
        {row.voidedAt ? ` on ${recordedOn(row.voidedAt)}` : ''}: {row.voidReason}
      </span>
    ) : null;

  const actions = (row: RemittanceRow, labelled: boolean) => {
    const iconOnly = labelled ? undefined : { padding: '0 10px' };
    return (
      <>
        {row.hasProof && (
          <a
            href={`/api/admin/remittances/${row.id}/proof`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-filter"
            title={labelled ? undefined : 'Open receipt'}
            aria-label={labelled ? undefined : `Open the receipt for the ${describeRemittance(row)}`}
            style={iconOnly}
          >
            <FileText size={16} aria-hidden={labelled || undefined} />
            {labelled && 'Receipt'}
          </a>
        )}
        {row.status === 'RECORDED' && (
          <button
            type="button"
            onClick={() => setVoiding(row)}
            className="btn-filter is-danger"
            title={labelled ? undefined : 'Void'}
            aria-label={labelled ? undefined : `Void the ${describeRemittance(row)}`}
            style={iconOnly}
          >
            <Ban size={16} aria-hidden={labelled || undefined} />
            {labelled && 'Void'}
          </button>
        )}
      </>
    );
  };

  const amountCell = (row: RemittanceRow) => (
    <span className={row.status === 'VOIDED' ? 'remittance-voided' : undefined}>
      {formatSignedPesos(row.kind === 'RETURN' ? -row.amount : row.amount)}
    </span>
  );

  return (
    <>
      <div className="admin-panel">
        <div className="admin-panel-header flex-wrap gap-3">
          <h2 className="admin-panel-title">Remittances</h2>
          <button type="button" className="btn-light max-sm:w-full" onClick={() => setRecording(true)}>
            <Plus size={16} aria-hidden="true" /> Record Remittance
          </button>
        </div>

        <div className="data-table-wrapper dash-desktop-only">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sent</th>
                <th>Kind</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Recorded By</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {remittances.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-secondary">
                    Nothing remitted yet. Record a payout once money has been sent to the organizer.
                  </td>
                </tr>
              ) : (
                remittances.map(row => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap">{formatEventDayShort(row.paidOn)}</td>
                    <td>{remittanceKindLabel(row.kind)}</td>
                    <td className="whitespace-nowrap font-medium text-primary">{amountCell(row)}</td>
                    <td className="whitespace-nowrap">{remittanceMethodLabel(row.method)}</td>
                    <td className="text-secondary max-w-56">
                      <span className="[overflow-wrap:anywhere]">{row.reference ?? '—'}</span>
                      {row.note && (
                        <span className="block text-xs mt-1 [overflow-wrap:anywhere]">{row.note}</span>
                      )}
                    </td>
                    <td className="text-secondary">
                      <div>{row.recordedByName}</div>
                      <div className="text-xs">{recordedOn(row.createdAt)}</div>
                    </td>
                    <td className="max-w-64">
                      {statusBadge(row)}
                      {voidLine(row)}
                    </td>
                    <td>
                      <div className="flex gap-2">{actions(row, false)}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="dash-mobile-only">
          <AdminCardList
            items={remittances}
            getKey={row => row.id}
            label={`Remittances for ${eventTitle}`}
            title={amountCell}
            subtitle={row => `${remittanceKindLabel(row.kind)} · ${formatEventDayShort(row.paidOn)}`}
            badges={statusBadge}
            fields={row => [
              { label: 'Method', value: remittanceMethodLabel(row.method) },
              { label: 'Reference', value: row.reference ?? '—' },
              ...(row.note ? [{ label: 'Note', value: row.note, full: true }] : []),
              { label: 'Recorded By', value: `${row.recordedByName} · ${recordedOn(row.createdAt)}`, full: true },
              ...(row.status === 'VOIDED'
                ? [
                    {
                      label: 'Voided',
                      value: `${row.voidedByName ?? 'Someone'}${row.voidedAt ? ` · ${recordedOn(row.voidedAt)}` : ''}: ${row.voidReason ?? ''}`,
                      full: true,
                    },
                  ]
                : []),
            ]}
            actions={row => (row.hasProof || row.status === 'RECORDED' ? actions(row, true) : null)}
            empty={
              <div className="py-12 px-4 text-center text-secondary">
                Nothing remitted yet. Record a payout once money has been sent to the organizer.
              </div>
            }
          />
        </div>
      </div>

      {recording && (
        <RecordRemittanceDialog
          eventId={eventId}
          eventTitle={eventTitle}
          balance={balance}
          today={today}
          onClose={saved => {
            setRecording(false);
            if (saved) {
              toast({ variant: 'success', message: `Recorded the ${saved}.` });
              router.refresh();
            }
          }}
        />
      )}

      {voiding && (
        <VoidRemittanceDialog
          key={voiding.id}
          remittance={voiding}
          onDone={voided => {
            setVoiding(null);
            if (voided) {
              toast({ variant: 'success', message: `Voided the ${describeRemittance(voiding)}.` });
              router.refresh();
            }
          }}
        />
      )}
    </>
  );
}
