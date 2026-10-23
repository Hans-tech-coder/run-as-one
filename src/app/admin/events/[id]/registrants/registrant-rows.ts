import type { Prisma } from '@prisma/client';
import type { StatusRecord } from '@/lib/activity';
import type { CategoryChangeView } from '@/lib/category-change-view';
import { orderLogisticsFields, type LogisticsChangeView } from '@/lib/logistics-change-view';
import { runnerRef } from '@/lib/order-ref';
import { isPdfProof } from '@/lib/uploads';
import { EMAIL_KIND_LABELS, outstandingEmail } from '@/lib/email-delivery';
import { isBankTransfer, isComplimentary, paymentMethodLabel } from '@/lib/registration-codes';
import { DISCOUNT_TYPES, asDiscountType } from '@/lib/discount';
import {
  GUARDIAN_RELATIONSHIP_LABELS,
  ageOn,
  asGuardianRelationship,
  guardianLine,
  needsGuardianConsent,
} from '@/lib/minor-consent';
import { formatEventInstant } from '@/lib/event-schedule';
import { bankTransferExpiresBy, isCancelledCheckout } from '@/lib/pending-expiry';
import { formatRunnerAddress } from '@/lib/runner-address';

/**
 * One row per live runner, as the registrants table, its cards, the detail
 * modal and the CSV export read them: every coded column turned into the words
 * a person reads, every instant worded in Manila, once, on the server.
 *
 * Split out of `page.tsx` (CATEGORY_CHANGE_PLAN.md Session 2), which was past
 * the size the repository splits files at, when a runner's category changes
 * had to join the row. The page fetches; this decides what a row says.
 */

/** The event as page.tsx fetches it: its listed orders, their live runners and categories. */
export type RegistrantsEvent = Prisma.EventGetPayload<{
  include: { registrations: { include: { runners: { include: { category: true } } } } };
}>;

export function buildRegistrantRows({
  event,
  statusRecords,
  changesByRunner,
  logisticsByOrder,
  shortInstant,
  csvInstant,
}: {
  event: RegistrantsEvent;
  /** Who last moved each order's status (activity-store's latestStatusChanges). */
  statusRecords: Map<string, StatusRecord>;
  changesByRunner: Map<string, CategoryChangeView[]>;
  /** Each order's delivery switches (LOGISTICS_CHANGE_PLAN.md), from logisticsChangesByOrder. */
  logisticsByOrder: Map<string, LogisticsChangeView[]>;
  shortInstant: (value: Date) => string;
  csvInstant: (value: Date) => string;
}): Record<string, unknown>[] {
  const runners: Record<string, unknown>[] = [];
  event.registrations.forEach(reg => {
    // An online checkout cancelled before it was paid was never a registrant;
    // it stays on the Unpaid checkouts tab (UNPAID_FOLLOWUP_PLAN.md Batch 2).
    if (isCancelledCheckout(reg, statusRecords.get(reg.id))) return;
    // Which transactional email this order still owes, decided once here from
    // the rule in lib/email-delivery.ts rather than re-derived in the table:
    // the same answer drives the row's mark, the backlog filter and the
    // manual-send modal, and three copies of it would eventually disagree.
    const pendingEmail = outstandingEmail(reg);
    // The Logistics columns, worded once in logistics-change-view.ts: each
    // runner's own parcel on a split order (RUNNER_ADDRESS_PLAN.md Batch 2)
    // and the order's switches, which the cell only reads — switching opens
    // from the row menu (LOGISTICS_CHANGE_PLAN.md Revision 2).
    const logistics = orderLogisticsFields(event, reg, logisticsByOrder.get(reg.id) ?? []);
    reg.runners.forEach((runner, runnerIndex) => {
      runners.push({
        id: runner.id,
        registrationId: reg.id,
        // This runner's permanent place in the registration order — 1 is the
        // first person who ever registered for this event. It is a property of
        // the registrant rather than of the view, so it is assigned here off
        // the ordered fetch and travels with the row: filter the table down to
        // the unpaid orders and the numbers still read 3, 7, 12, which says
        // who those people are. A row index would have renumbered them 1, 2, 3
        // and said nothing at all.
        //
        // Derived from the order rather than stored, so it is a reading of the
        // list as it stands and not a bib number: cancel an early order and
        // everyone behind it shifts up by one. A number that has to survive
        // that would need a column of its own.
        regNo: runners.length + 1,
        orderRef: reg.orderRef,
        // When the order was placed: the moment the registration form was
        // submitted, which for an online payment is when the runner went to
        // checkout, not when the money arrived. Every runner of a group shares
        // it, since they were registered in one submission.
        registeredAtLabel: shortInstant(reg.createdAt),
        registeredAt: csvInstant(reg.createdAt),
        runnerNo: runner.runnerNo,
        // One orderRef covers the whole order, so on a screen with one row per
        // runner it cannot say which of them this is — unless the order holds
        // only one runner, where there is nothing to tell apart and the bare
        // order reference is the answer. Built here rather than in the table so
        // the reference the admin reads is the same string the runner was
        // emailed — see lib/order-ref.ts.
        runnerRef: runnerRef(reg.orderRef, runner.runnerNo, reg.runners.length),
        firstName: runner.firstName,
        lastName: runner.lastName,
        name: `${runner.firstName} ${runner.lastName}`,
        email: runner.email,
        phone: runner.phone,
        gender: runner.gender,
        birthdate: runner.birthdate,
        // Guardian consent (GUARDIAN_CONSENT_PLAN.md Batch 4). Whether this
        // runner is a minor is decided here, against the race day, with the
        // same rule the wizards and the checkout routes use — never re-derived
        // from the guardian columns, because a row from before Batch 3, or a
        // birthdate staff corrected later, is a minor with none on file, and
        // that is exactly the row the organizer has to be told about.
        isMinor: needsGuardianConsent(runner.birthdate, event.date),
        ageOnRaceDay: ageOn(runner.birthdate, event.date),
        guardianName: runner.guardianName,
        guardianRelationship: asGuardianRelationship(runner.guardianRelationship),
        guardianRelationshipLabel: (() => {
          const known = asGuardianRelationship(runner.guardianRelationship);
          return known ? GUARDIAN_RELATIONSHIP_LABELS[known] : null;
        })(),
        guardianLine: guardianLine(runner.guardianName, runner.guardianRelationship),
        // Worded on the server, in Manila time, so the modal and the CSV read
        // the same instant the same way on every organizer's machine.
        guardianConsentAt: runner.guardianConsentAt ? runner.guardianConsentAt.toISOString() : null,
        guardianConsentAtLabel: runner.guardianConsentAt
          ? formatEventInstant(runner.guardianConsentAt)
          : null,
        category: runner.category.name,
        distance: runner.category.distance,
        // Its id too, so the Change category modal can mark the current option.
        categoryId: runner.categoryId,
        // Every category change this runner has had, oldest first
        // (CATEGORY_CHANGE_PLAN.md D1): the badge, the Kit changed chip and
        // the detail modal's history all read them, through
        // category-change-display.tsx, so the three cannot disagree.
        categoryChanges: changesByRunner.get(runner.id) ?? [],
        size: runner.singletSize,
        runningCommunity: runner.runningCommunity,
        status: reg.status,
        // The latest recorded change to that status — who, when, and to what.
        // statusProvenance (lib/activity.ts) only names the person when it
        // still agrees with the status above.
        statusRecord: statusRecords.get(reg.id) ?? null,
        // When the abandoned-checkout sweep expired this order, or null on the
        // overwhelming majority of rows that were never swept. Carried so the
        // detail modal can say *when* rather than leaving EXPIRED unexplained
        // — see lib/pending-expiry.ts.
        expiredAt: reg.expiredAt ? reg.expiredAt.toISOString() : null,
        // The latest a bank transfer waiting on its slip can still hold its
        // slot (BANK_TRANSFER_EXPIRY_DAYS). Shown in the detail modal so the
        // expiry has a date the organizer saw coming; null on everything else.
        verifyBy:
          reg.status === 'PENDING' && isBankTransfer(reg.paymentMethod)
            ? shortInstant(bankTransferExpiresBy(reg.createdAt))
            : null,
        emergencyContactName: runner.emergencyContactName,
        emergencyContactPhone: runner.emergencyContactPhone,
        // The runner's home address (RUNNER_ADDRESS_PLAN.md). The four parts
        // raw, for the edit modal to PUT back, and joined once for the table,
        // the detail modal and the CSV. Empty on rows from before it was
        // collected, never a display word, for the same reason as medical
        // conditions below.
        addressProvince: runner.addressProvince ?? '',
        addressCity: runner.addressCity ?? '',
        addressBarangay: runner.addressBarangay ?? '',
        addressStreet: runner.addressStreet ?? '',
        homeAddress: formatRunnerAddress(runner),
        // Kept raw, not defaulted to a readable "None": the edit modal PUTs
        // this row straight back, so a display word here would be saved as the
        // runner's actual medical history. The table, the modal and the export
        // each supply their own wording for an empty answer.
        medicalConditions: runner.medicalConditions || '',
        // The three coded columns arrive here as codes (BANK_TRANSFER,
        // DELIVERY, INSIDE) and leave as the uppercase words a person reads.
        // Done once, here, so the table, the filters, the detail modal and the
        // CSV export can never format them three different ways again — and
        // uppercase, because on this screen they are stored data sitting beside
        // a runner's uppercase name, not a choice being offered.
        // The method, the zone the runner declared at checkout (it decides
        // which delivery fee they were charged; blank when both zones cost the
        // same), where this runner's kit goes, `isDelivery` decided from the
        // code rather than the label, and the order's delivery switches.
        ...logistics[runnerIndex],
        paymentMethod: paymentMethodLabel(reg.paymentMethod).toUpperCase(),
        // The branches the screen actually needs, decided from the code rather
        // than by matching the label back against a string.
        isBankTransfer: isBankTransfer(reg.paymentMethod),
        // A free pacer entry, read from the discount this order snapshotted
        // rather than from the promo code, which staff may since have paused
        // or deleted (PACER_DISCOUNT_PLAN.md Batch 3). Decided here for the
        // same reason the two branches above are: the table is a client
        // island, and matching a label back against a string is how a screen
        // starts disagreeing with the database.
        isPacer: asDiscountType(reg.discountType) === DISCOUNT_TYPES.PACER,
        // ₱0 and nothing to validate. The chip above says *why* it was free;
        // this says how it was settled, and it is what stops the detail modal
        // printing a bare COMPLIMENTARY nobody can interpret.
        isComplimentary: isComplimentary(reg.paymentMethod),
        proofOfPayment: reg.proofOfPayment,
        // Whether that proof is a PDF rather than a photo. Decided here, off
        // the stored pathname, because the module that knows the rule imports
        // the Blob SDK and the table is a client island.
        proofIsPdf: isPdfProof(reg.proofOfPayment),
        transactionNumber: reg.transactionNumber,
        consentGiven: reg.consentGiven,
        consentGivenAt: reg.consentGivenAt,
        // The name the person submitting typed under the tick. Null on any
        // registration made before it was asked for, which the detail modal
        // says rather than leaving a blank line.
        consentSignature: reg.consentSignature,
        // The payment validator's own notes on this order. Internal, so never
        // an email; the CSV export carries them as Payment Remarks (since
        // 2026-10-23). Carried on every runner of a group because the note
        // is about the order all of them are on.
        remarks: reg.remarks,
        remarksBy: reg.remarksBy,
        // Serialized here rather than in the client component: the table is a
        // client island and a Date crossing that boundary arrives as a string
        // anyway, so it is made one deliberately.
        remarksAt: reg.remarksAt ? reg.remarksAt.toISOString() : null,
        // Email delivery, on every runner of the order for the same reason the
        // remarks are: the email is about the order, and a mark that lit up on
        // one member of a group would leave the other four looking fine.
        emailPending: pendingEmail !== null,
        emailPendingKind: pendingEmail,
        emailPendingLabel: pendingEmail ? EMAIL_KIND_LABELS[pendingEmail] : null,
        // Resend's own words for the last failure — a quota stop reads
        // differently from a bad address, and the modal shows which.
        lastEmailError: reg.lastEmailError,
        receivedEmailSentAt: reg.receivedEmailSentAt ? reg.receivedEmailSentAt.toISOString() : null,
        confirmationEmailSentAt: reg.confirmationEmailSentAt
          ? reg.confirmationEmailSentAt.toISOString()
          : null,
        manualEmailSentAt: reg.manualEmailSentAt ? reg.manualEmailSentAt.toISOString() : null,
        manualEmailSentBy: reg.manualEmailSentBy,
        // The order's money, carried on every runner of it for the same reason
        // the remarks are: it belongs to the order, not to one member. Only
        // what a person reconciling a payment needs — the discount explains why
        // a transfer came in short, and the total is what it should have been.
        // Both names on an order that combined two promotions, so the CSV and
        // the detail modal say "EARLY BIRD + 5+1 FREE" beside the whole discount.
        promoCode: [reg.promoCode, reg.combinedPromoCode].filter(Boolean).join(' + ') || null,
        discountAmount: reg.discountAmount,
        // When the runner's promo price lock was taken, on an order the lock
        // priced (Registration.priceLockedAt) — what explains an early-bird
        // discount on an order placed after the early bird closed. Worded on
        // the server in Manila time, as the guardian consent above is.
        priceLockedAtLabel: reg.priceLockedAt ? formatEventInstant(reg.priceLockedAt) : null,
        totalAmount: reg.totalAmount
      });
    });
  });

  return runners;
}
