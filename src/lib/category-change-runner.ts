import 'server-only';
import db from '@/lib/db';
import { recordAudit, type AuditActor } from '@/lib/audit';
import { deletePrivateFile } from '@/lib/blob';
import { CATEGORY_CHANGE_STATUSES, categoryChangeDeadline } from '@/lib/category-change';
import { changeHeldUntil, changePayableState, isOutsidePayment } from '@/lib/category-change-hold';
import { CategoryChangeRefused } from '@/lib/category-change-context';
import { lockChange } from '@/lib/category-change-locks';
import { readChangeForPayment } from '@/lib/category-change-payment';
import { categoryChangeProofReceivedEmail, sendCategoryChangeEmail } from '@/lib/email-category-change';

/**
 * **What the runner may do on a GCash or bank category change's link**
 * (`/pay/change/[token]`, the owner, 2026-10-20): hand in the payment's
 * screenshot and reference, as on a delivery switch's link
 * (`logistics-change-runner.ts`). The route is `api/category-change/proof`,
 * which trusts nothing but the signed token.
 *
 * The proof lands on the change's own `proofOfPayment` and `transactionNumber`
 * while it waits, replacing an earlier one, whose file is deleted. Nothing
 * applies here: staff press *Validate Payment*, which records the runner's own
 * reference and keeps their screenshot (`recordChangePayment`). Once the proof
 * is in, the row reads FOR VALIDATION and the hold no longer lets the seat go
 * (`changeHeldUntil`); the change deadline still closes it.
 *
 * Judged under the runner's lock (`lockChange`) and claimed with a conditional
 * write on AWAITING_PAYMENT and the proof it read there, so a payment applied, a cancel, the sweep, or a second upload landing at the
 * same moment wins cleanly and this one is refused.
 */

/** Who the trail names for what the runner did on the link. */
function runnerActor(organizerId: string, runner: { firstName: string; lastName: string; email: string }): AuditActor {
  const name = `${runner.firstName} ${runner.lastName}`.trim() || 'The runner';
  return { kind: 'SYSTEM', id: null, orgId: organizerId, name: `${name} (on the change's link)`, email: runner.email };
}

/**
 * The runner handed in the GCash or bank payment's screenshot and reference.
 * The upload is the caller's (`uploadPrivateProof`, before this, so a refusal
 * here leaves the caller to delete it). Emails the runner that it arrived.
 */
export async function submitChangeProof(
  changeId: string,
  proof: { transactionNumber: string; proofPathname: string },
): Promise<void> {
  const change = await readChangeForPayment(changeId);
  if (!change) throw new CategoryChangeRefused(404, 'This link is not valid any more.');
  if (!isOutsidePayment(change.paymentMethod)) {
    throw new CategoryChangeRefused(409, 'This change is paid online. Reload the page and press Pay now.');
  }

  // Judged again under the runner's lock, as staff's Validate Payment and the
  // sweep take it: the proof and hold read above may have moved since.
  const replaced = await db.$transaction(async tx => {
    const { change: locked } = await lockChange(tx, changeId);
    const held = { status: locked.status, holdUntil: changeHeldUntil(locked) };
    if (changePayableState(held, categoryChangeDeadline(change.event), new Date()) !== 'payable') {
      throw new CategoryChangeRefused(409, 'This change is no longer waiting for payment. Reload the page.');
    }
    const claim = await tx.categoryChange.updateMany({
      where: { id: changeId, status: CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT, proofOfPayment: locked.proofOfPayment },
      data: { proofOfPayment: proof.proofPathname, transactionNumber: proof.transactionNumber },
    });
    if (claim.count === 0) throw new CategoryChangeRefused(409, 'This change moved just now. Reload the page and try again.');
    await recordAudit(tx, runnerActor(change.event.organizerId, change.runner), {
      action: 'category_change.proof_submitted',
      entityType: 'CategoryChange',
      entityId: changeId,
      eventId: change.eventId,
      organizerId: change.event.organizerId,
      summary: `The runner ${locked.proofOfPayment ? 'replaced' : 'submitted'} the GCash or bank proof for the move from ${change.fromCategory.name} to ${change.toCategory.name} (${change.changeRef}, order ${change.registration.orderRef}), reference ${proof.transactionNumber}. Check it, then validate the payment.`,
      changes: {
        transactionNumber: [locked.transactionNumber, proof.transactionNumber] as [string | null, string],
        proofOfPayment: locked.proofOfPayment ? 'replaced' : 'attached',
      },
    });
    return locked.proofOfPayment;
  });

  if (replaced) {
    await deletePrivateFile(replaced).catch(error =>
      console.error('Category change: the replaced proof could not be deleted', error),
    );
  }
  const message = await categoryChangeProofReceivedEmail({
    changeRef: change.changeRef,
    totalCharged: change.totalCharged || change.amount,
    transactionNumber: proof.transactionNumber,
    fromCategory: change.fromCategory,
    toCategory: change.toCategory,
    runner: change.runner,
    event: change.event,
  });
  const outcome = await sendCategoryChangeEmail(message).catch(error => ({ sent: false as const, error: String(error) }));
  if (!outcome.sent) console.error(`Category change ${change.changeRef}: the proof-received email was not sent`, outcome.error);
}
