"use client";

/**
 * The state behind Change category (`CategoryChangeModal.tsx`) and the
 * registrants table's side of every category change (CATEGORY_CHANGE_PLAN.md
 * Session 2): the preview fetch, the live quote, the save, and what the table
 * does with each answer: the row's category and history replaced, the open
 * detail modal moved with it, and the by-hand email panel opened when Resend
 * refused the applied email.
 *
 * An upgrade (Session 3) also carries how it is paid: the choice sets the
 * quote's transaction fee as staff pick it, and *Already paid by GCash or bank*
 * saves in two steps — the change is opened, then its payment recorded with the
 * reference and the shrunk screenshot, which applies it. A record that fails
 * leaves the change open with its seat held, and staff are told to record it
 * from the runner's details.
 *
 * Split out of the modal so neither file is past the size the repository splits
 * files at, and so `RegistrantsTable.tsx` mounts one hook rather than carrying
 * the change logic itself.
 */

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useAlert } from '@/components/ui/AlertProvider';
import { CATEGORY_CHANGE_STATUSES, quoteCategoryChange, readBasisAdjustment } from '@/lib/category-change';
import { DOWNGRADES_ON_HOLD } from '@/lib/category-change-settings';
import {
  CHANGE_PAYMENT_CHOICES,
  OUTSIDE_CHANGE_HOLD_DAYS,
  onlineChangeMethod,
  paymentMethodForChoice,
  readTransactionNumber,
  type ChangePaymentChoice,
} from '@/lib/category-change-hold';
import { transactionFeeFor } from '@/lib/free-checkout';
import { compressImage } from '@/lib/image-compress';
import { parsePesos } from '@/lib/settlement';
import type { CategoryChangePreview } from '@/lib/category-change-context';
import type { CategoryChangeView } from '@/lib/category-change-view';
import type { RenderedEmail } from './email-handoff';
import type { RegistrantRow } from './RegistrantsTable';
import type { ChangeEmailRequest } from './CategoryChangeEmailModal';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;

/** What the route answers after a change is made. */
export type AppliedChange = {
  change: CategoryChangeView;
  /** Null while an upgrade waits: the runner has not moved yet. */
  category: { id: string; name: string; distance: string } | null;
  /** Null when no email went out, because a payment record follows at once. */
  email: { sent: true; to: string } | { sent: false; error: string; message: RenderedEmail | null } | null;
  /** Which email: the payment link and breakdown, or the move done. */
  emailKind: 'created' | 'applied';
};

export function useCategoryChangeModal({
  runners,
  setRunners,
  setViewingRunner,
}: {
  runners: RegistrantRow[];
  setRunners: Dispatch<SetStateAction<RegistrantRow[]>>;
  setViewingRunner: Dispatch<SetStateAction<RegistrantRow | null>>;
}) {
  const { alert, toast } = useAlert();

  /**
   * Every write hands back the change as the screen reads it; it replaces its
   * copy, or joins the runner's list, on the row and the open detail modal.
   */
  const updateChange = (
    runnerId: string,
    change: CategoryChangeView,
    category?: { id: string; name: string; distance: string } | null,
  ) => {
    const apply = (row: RegistrantRow | null) => {
      if (!row || row.id !== runnerId) return row;
      const list: CategoryChangeView[] = row.categoryChanges ?? [];
      const known = list.some(c => c.id === change.id);
      return {
        ...row,
        ...(category ? { category: category.name, distance: category.distance, categoryId: category.id } : {}),
        categoryChanges: known ? list.map(c => (c.id === change.id ? change : c)) : [...list, change],
      };
    };
    setRunners(current => current.map(apply));
    setViewingRunner(apply);
  };

  // The applied email's by-hand send, from a refused send or the history.
  const [changeEmail, setChangeEmail] = useState<ChangeEmailRequest | null>(null);

  const openChangeEmail = (row: RegistrantRow, change: CategoryChangeView, kind: 'applied' | 'created' = 'applied') =>
    setChangeEmail({
      kind,
      runnerId: row.id,
      changeId: change.id,
      changeRef: change.changeRef,
      runnerName: row.name,
      message: null,
      error: change.lastEmailError,
    });

  const onApplied = (runnerId: string, result: AppliedChange) => {
    updateChange(runnerId, result.change, result.category);
    if (result.email && !result.email.sent) {
      const row = runners.find(r => r.id === runnerId);
      setChangeEmail({
        kind: result.emailKind,
        runnerId,
        changeId: result.change.id,
        changeRef: result.change.changeRef,
        runnerName: row?.name ?? '',
        message: result.email.message,
        error: result.email.error,
      });
    }
  };
  const [runner, setRunner] = useState<RegistrantRow | null>(null);
  const [preview, setPreview] = useState<CategoryChangePreview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toCategoryId, setToCategoryId] = useState('');
  const [reason, setReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [basisText, setBasisText] = useState('');
  const [basisReason, setBasisReason] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [pickedChoice, setPickedChoice] = useState<ChangePaymentChoice | null>(null);
  const [transactionNumber, setTransactionNumber] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [paymentErrors, setPaymentErrors] = useState<{ choice?: string; transactionNumber?: string; proofFile?: string }>({});

  const load = async (runnerId: string) => {
    setLoadError('');
    setPreview(null);
    try {
      const res = await fetch(`/api/admin/runners/${runnerId}/category-change?preview=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data?.error || 'This runner could not be loaded. Close and try again.');
        return;
      }
      setPreview(data);
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    }
  };

  const open = (runnerId: string) => {
    const row = runners.find(r => r.id === runnerId);
    if (!row) return;
    setRunner(row);
    setToCategoryId('');
    setReason('');
    setAdjusting(false);
    setBasisText('');
    setBasisReason('');
    setShowErrors(false);
    setPickedChoice(null);
    setTransactionNumber('');
    setProofFile(null);
    setPaymentErrors({});
    setIsOpen(true);
    void load(runnerId);
  };

  const close = () => {
    if (isSaving) return;
    setIsOpen(false);
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setRunner(null);
      setPreview(null);
    }, CLOSE_MS);
  };

  const adjustment = adjusting ? readBasisAdjustment(basisText, basisReason) : { value: null, error: null };
  // A peso amount typed with no reason yet. It is not applied — the quote stays
  // on the computed basis (D3: an adjustment needs its reason) — but the modal
  // says so at once, because with an upgrade's button disabled staff could
  // never press confirm to be told what is missing.
  const reasonMissing = !!adjustment.error && adjustment.error.startsWith('Say');
  const pendingBasis = adjusting && reasonMissing ? parsePesos(basisText) : null;
  const target = preview?.categories.find(c => c.id === toCategoryId) ?? null;
  // Only the way the entry was paid is offered; a single way is chosen for staff.
  const paymentChoices = preview?.paymentChoices ?? [];
  const paymentChoice = pickedChoice ?? (paymentChoices.length === 1 ? paymentChoices[0] : null);

  // The same function the route writes with, on what the preview read.
  const quoteTo = (to: { price: number }, method: string | null) => {
    if (!preview) return null;
    const current = preview.categories.find(c => c.id === preview.runner.categoryId);
    if (!current) return null;
    return quoteCategoryChange({
      fromPrice: current.price,
      toPrice: to.price,
      promoPrice: preview.runner.promoPrice,
      order: {
        discountAmount: preview.order.discountAmount,
        discountType: preview.order.discountType,
        totalAmount: preview.order.totalAmount,
        addOnTotal: preview.order.addOnTotal,
        transactionFee: preview.order.transactionFee,
        runnerCount: preview.order.runnerCount,
      },
      event: preview.event,
      basisAdjustment: adjustment.value,
      paymentMethod: method,
    });
  };
  const quote = useMemo(
    // D13: the fee is on top only once staff choose to send a payment link.
    () => (target ? quoteTo(target, paymentChoice ? paymentMethodForChoice(paymentChoice) : null) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview, target, adjustment.value, paymentChoice],
  );
  // Options that would be a downgrade for this runner, while downgrades are on
  // hold (category-change.ts): measured by the same quote, so a tile and the
  // route agree on what "cheaper" means for what this runner paid.
  const downgradeIds = new Set(
    DOWNGRADES_ON_HOLD
      ? (preview?.categories ?? []).filter(c => quoteTo(c, null)?.direction === 'DOWNGRADE').map(c => c.id)
      : [],
  );
  const needsPayment = quote?.status === CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT;
  const onlineMethod = onlineChangeMethod();
  const onlineFee = quote && needsPayment ? transactionFeeFor(quote.amount, onlineMethod) : 0;

  const finishSave = () => {
    setIsSaving(false);
    setIsOpen(false);
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setRunner(null);
      setPreview(null);
    }, CLOSE_MS);
  };

  /** Records the payment of a change just opened as already paid. */
  const recordPayment = async (changeId: string): Promise<AppliedChange | { error: string }> => {
    const form = new FormData();
    form.set('transactionNumber', transactionNumber);
    if (proofFile) form.set('proofFile', await compressImage(proofFile, 'proof'));
    try {
      const res = await fetch(`/api/admin/category-changes/${changeId}/record-payment`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      return res.ok ? (data as AppliedChange) : { error: data?.error || 'The payment could not be recorded.' };
    } catch {
      return { error: 'Could not reach the server to record the payment.' };
    }
  };

  const save = async () => {
    if (!runner || !target || !quote) return;
    if (adjustment.error) {
      setShowErrors(true);
      return;
    }
    if (needsPayment) {
      const errors: typeof paymentErrors = {};
      if (!paymentChoice) errors.choice = 'Choose how the runner pays';
      if (paymentChoice === CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID) {
        const reference = readTransactionNumber(transactionNumber);
        if (reference.error) errors.transactionNumber = reference.error;
      }
      setPaymentErrors(errors);
      if (Object.keys(errors).length > 0) return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/runners/${runner.id}/category-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toCategoryId: target.id,
          reason,
          ...(adjusting ? { basis: basisText, basisReason } : {}),
          ...(needsPayment ? { paymentChoice } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alert({
          variant: 'error',
          title: 'Category Not Changed',
          message: data?.error || 'The category could not be changed. Try again.',
        });
        // Seats or eligibility may have moved since the modal opened.
        void load(runner.id);
        return;
      }
      let result = data as AppliedChange;
      if (
        paymentChoice === CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID &&
        result.change.status === CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT
      ) {
        const recorded = await recordPayment(result.change.id);
        if ('error' in recorded) {
          onApplied(runner.id, result);
          finishSave();
          await alert({
            variant: 'error',
            title: 'Payment Not Recorded',
            message: `${recorded.error} The change is open and the seat in ${target.name} is held for ${OUTSIDE_CHANGE_HOLD_DAYS} days. Record the payment from the runner's details.`,
          });
          return;
        }
        result = recorded;
      }
      onApplied(runner.id, result);
      const awaiting = result.change.status === CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT;
      const emailed = result.email?.sent ?? false;
      toast(
        awaiting
          ? emailed
            ? `${target.name} seat held for ${runner.name}. The runner was emailed how to pay.`
            : `${target.name} seat held for ${runner.name}. The email did not go out; send it by hand.`
          : emailed
            ? `${runner.name} moved to ${target.name}. The runner was emailed.`
            : `${runner.name} moved to ${target.name}. The email did not go out; send it by hand.`,
      );
      finishSave();
    } catch {
      await alert({
        variant: 'error',
        title: 'Category Not Changed',
        message: 'Could not reach the server. Check your connection and try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    open,
    updateChange,
    onApplied,
    openChangeEmail,
    changeEmail,
    closeChangeEmail: () => setChangeEmail(null),
    modalProps: {
      runner,
      preview,
      loadError,
      isOpen,
      isClosing,
      isSaving,
      toCategoryId,
      setToCategoryId,
      reason,
      setReason,
      adjusting,
      setAdjusting,
      basisText,
      setBasisText,
      basisReason,
      setBasisReason,
      // A basis that is not a peso amount is an error as soon as it is typed; a
      // missing reason is a hint (`pendingBasis`) until a confirm makes it one.
      adjustmentError:
        showErrors || (adjustment.error && !reasonMissing) ? adjustment.error : null,
      pendingBasis,
      quote,
      needsPayment,
      onlineMethod,
      onlineFee,
      paymentChoices,
      downgradeIds,
      paymentChoice,
      setPaymentChoice: (choice: ChangePaymentChoice) => {
        setPickedChoice(choice);
        setPaymentErrors({});
      },
      transactionNumber,
      setTransactionNumber: (value: string) => {
        setTransactionNumber(value);
        setPaymentErrors(errors => ({ ...errors, transactionNumber: undefined }));
      },
      proofFile,
      setProofFile,
      paymentErrors,
      onClose: close,
      onSave: save,
    },
  };
}

