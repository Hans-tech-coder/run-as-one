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
 */

import { useState, type Dispatch, type SetStateAction } from 'react';
import { useAlert } from '@/components/ui/AlertProvider';
import type { RegistrantRow } from './RegistrantsTable';

export function usePaymentStatus({
  setRunners,
  setViewingRunner,
  setProofRunner,
}: {
  setRunners: Dispatch<SetStateAction<RegistrantRow[]>>;
  setViewingRunner: Dispatch<SetStateAction<RegistrantRow | null>>;
  setProofRunner: Dispatch<SetStateAction<RegistrantRow | null>>;
}) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { alert, toast, progress } = useAlert();

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
  ) => {
    setUpdatingId(registrationId);
    const paid = newStatus === 'PAID';
    const done = paid ? 'Payment validated.' : 'Payment status updated.';
    const status =
      announce === 'progress'
        ? progress(paid ? 'Validating payment' : 'Updating payment status')
        : null;
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const { statusChange } = await res.json().catch(() => ({ statusChange: null }));
        // The route answers with who made the change, so the detail modal's
        // "Validated by" line names them now rather than after a reload — and
        // the open modal and lightbox hold copies of the row, so they move too.
        const settle = (row: RegistrantRow | null) =>
          row && row.registrationId === registrationId
            ? { ...row, status: newStatus, statusRecord: statusChange ?? row.statusRecord }
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
        alert(data?.error || 'The payment status could not be changed. Please try again.');
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
    handleStatusChange(runner.registrationId, 'PAID', 'result');
  };

  return { updatingId, handleStatusChange, validatePayment };
}
