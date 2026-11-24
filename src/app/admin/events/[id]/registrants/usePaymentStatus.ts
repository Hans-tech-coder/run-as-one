"use client";

/**
 * Moving an order's payment status from the registrants screen: the row menu's
 * Validate Payment, the detail modal's footer and the receipt lightbox. The
 * route answers with who made the change, so every copy of the row — the
 * table's, the open detail modal's and the lightbox's — moves together, and
 * only once the route has said yes.
 *
 * Split out of `RegistrantsTable.tsx`, which was past the size the repository
 * splits files at, before LOGISTICS_CHANGE_PLAN.md Session 2 added to it.
 *
 * **Paid to** (PAYMENT_CHANNELS_PLAN.md D2, Batch 3): the detail modal and the
 * lightbox validate with the account the validator confirmed, one pick per
 * order shared by both, so choosing it in the modal and validating from the
 * proof sends the same answer. It starts at the runner's own pick
 * (`initialPaidTo`). The row menu's one-press Validate sends none, which keeps
 * what the runner chose.
 *
 * **Possible duplicate** (DUPLICATE_ORDERS_PLAN.md): the route refuses to
 * mark an order PAID while its runners are on another live order, and names
 * those orders. The validator is asked once; going ahead re-sends with
 * `confirmDuplicate`, which the route writes into the audit trail.
 */

import { useState, type Dispatch, type SetStateAction } from 'react';
import { useAlert } from '@/components/ui/AlertProvider';
import type { RegistrantRow } from './RegistrantsTable';
import { staffError } from './reference-held';
import { initialPaidTo, usePaidToAccounts } from './paid-to';

export function usePaymentStatus({
  setRunners,
  setViewingRunner,
  setProofRunner,
}: {
  setRunners: Dispatch<SetStateAction<RegistrantRow[]>>;
  setViewingRunner: Dispatch<SetStateAction<RegistrantRow | null>>;
  setProofRunner: Dispatch<SetStateAction<RegistrantRow | null>>;
}) {
  const paidToAccounts = usePaidToAccounts();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // The validator's *Paid to* pick, for the one order they are looking at.
  const [paidToPick, setPaidToPick] = useState<{ registrationId: string; value: string } | null>(null);
  const paidToFor = (runner: RegistrantRow): string =>
    paidToPick && paidToPick.registrationId === runner.registrationId
      ? paidToPick.value
      : initialPaidTo(runner.paidTo, paidToAccounts);
  const pickPaidTo = (registrationId: string, value: string) => setPaidToPick({ registrationId, value });
  const { alert, confirm, toast, progress } = useAlert();

  /**
   * `announce` says who shows the wait. From the row menu — the default — the
   * menu has closed on the press, so a progress toast carries it (§9). From the
   * detail modal or the receipt lightbox, their own Validate button already
   * reads "Updating", so only the result is toasted.
   */
  const handleStatusChange = async (
    registrationId: string,
    newStatus: string,
    announce: 'progress' | 'result' = 'progress',
    paidTo?: string,
  ) => {
    setUpdatingId(registrationId);
    const paid = newStatus === 'PAID';
    const done = paid ? 'Payment validated.' : 'Payment status updated.';
    let status =
      announce === 'progress'
        ? progress(paid ? 'Validating payment' : 'Updating payment status')
        : null;
    try {
      const send = (confirmDuplicate: boolean) =>
        fetch(`/api/admin/registrations/${registrationId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: newStatus,
            ...(paidTo ? { paidTo } : {}),
            ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
          }),
        });
      let res = await send(false);
      if (res.status === 409) {
        const data = await res.clone().json().catch(() => ({}));
        if (data?.code === 'possibleDuplicate') {
          // Not "Validating" behind a question nobody has answered yet.
          status?.clear();
          const refs = (data.matches ?? [])
            .map((m: { orderRef: string; status: string }) => `${m.orderRef} (${m.status})`)
            .join(', ');
          const go = await confirm({
            variant: 'danger',
            title: 'Possible Duplicate',
            message: `The same runners are on ${refs}. Check that this is a separate payment before you validate. Validate anyway?`,
            confirmLabel: 'Validate Anyway',
          });
          if (!go) return;
          status = announce === 'progress' ? progress('Validating payment') : null;
          res = await send(true);
        }
      }
      if (res.ok) {
        const { statusChange, registration } = await res
          .json()
          .catch(() => ({ statusChange: null, registration: null }));
        // The route answers with who made the change, so the detail modal's
        // "Validated by" line names them now rather than after a reload — and
        // the open modal and lightbox hold copies of the row, so they move too.
        const settle = (row: RegistrantRow | null) =>
          row && row.registrationId === registrationId
            ? {
                ...row,
                status: newStatus,
                statusRecord: statusChange ?? row.statusRecord,
                // The account as saved: the validator's pick, or the runner's kept.
                ...(registration && 'paidTo' in registration ? { paidTo: registration.paidTo } : {}),
              }
            : row;
        setRunners(current => current.map(settle));
        setViewingRunner(settle);
        setProofRunner(settle);
        if (status) status.done(done);
        else toast(done);
      } else {
        // Used to fail silently (a console line nobody reads) while the row
        // kept saying PENDING — the organizer had no way to know to retry.
        const data = await res.json().catch(() => ({}));
        status?.clear();
        alert({ message: staffError(data, 'The payment status could not be changed. Please try again.') });
      }
    } catch (e) {
      console.error(e);
      status?.clear();
      alert('Could not reach the server. Check your connection and try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  /**
   * Marks a bank transfer paid from either door — the detail modal's footer
   * or the receipt lightbox. Whichever panel is open moves to PAID with the
   * table, in handleStatusChange, once the route has said yes — never before:
   * validating an expired transfer is refused when the race has refilled
   * (api/admin/registrations/[id]/status), and a panel already reading PAID
   * behind that refusal would tell the organizer the opposite of what
   * happened.
   */
  const validatePayment = (runner: RegistrantRow) => {
    handleStatusChange(runner.registrationId, 'PAID', 'result', runner.isBankTransfer ? paidToFor(runner) : undefined);
  };

  return { updatingId, handleStatusChange, validatePayment, paidToFor, pickPaidTo };
}
