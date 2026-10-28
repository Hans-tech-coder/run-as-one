"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  ArrowLeft,
  Plus,
  CheckCircle2,
  UploadCloud,
  FileImage,
  FileText,
  X,
  MapPin,
  Clock,
  MessageSquareHeart,
} from "lucide-react";
import LinkPendingIcon from "@/components/ui/LinkPendingIcon";
import { formatPesos } from "@/lib/money";
import {
  MAX_UPLOAD_MB,
  PDF_TYPE,
  acceptAttribute,
  describeUploadTypes,
} from "@/lib/uploads";
import { useImageCompression } from "@/lib/image-compress";
import { PICKUP_FALLBACK, pickupDetails, pickupLabel, pickupOnlyLine } from "@/lib/pickup";
import { deliveryTiers, offersDelivery, needsDeliveryZoneChoice } from "./delivery";
import DeliveryStep from "./DeliveryStep";
import { useDeliveryPlan } from "./useDeliveryPlan";
import { usePromoPricing } from "./usePromoPricing";
import { usePriceHold, usePriceLock } from "./usePriceLock";
import { PriceChangedNotice, WaitForFreshPrice } from "./PriceLockNotices";
import { isPriceChanged, type PriceChangedBody } from "@/lib/price-changed";
import { type BankAccountView } from "@/lib/bank-accounts";
import {
  asLogisticsMethod,
  type LogisticsMethod,
} from "@/lib/registration-codes";
import BankDetailsModal from "./BankDetailsModal";
import SizeGuideModal from "./SizeGuideModal";
import ConsentWaiver, { SIGNATURE_FIELD_ID } from "./ConsentWaiver";
import { consentSignatureError } from "@/lib/consent-signature";
import { needsGuardianConsent } from "@/lib/minor-consent";
import { resolveConsentWaiver } from "@/lib/consent-waiver";
import {
  categoryNeedsShirtSize,
  findCategory,
} from "@/lib/shirt-size";
import {
  describePromo,
  type PromoTerms,
} from "@/lib/discount";
import {
  FREE_ORDER_SUBMIT_LABEL,
  FREE_ORDER_TOTAL_LABEL,
  OFFERED_PAYMONGO_METHODS,
  transactionFeeFor,
} from "@/lib/free-checkout";
import PromoCodeField from "./PromoCodeField";
import OrderSummary from "./OrderSummary";
import StepRail from "@/components/ui/StepRail";
import FreeSlotOffer from "./FreeSlotOffer";
import GroupLimitNotice from "./GroupLimitNotice";
import { MAX_RUNNERS_PER_ORDER, ORDER_SIZE_LIMIT_MESSAGE } from "@/lib/order-size";
import { communitySlug } from "@/lib/running-community";
import {
  isUppercasedRunnerField,
  upperCaseAsTyped,
} from "@/lib/text-case";
import { sellsPackages } from "@/lib/event-type";
import WizardEventHeader from "./WizardEventHeader";
import { useAlert } from "@/components/ui/AlertProvider";
import RunnerOverlay from "@/components/ui/RunnerOverlay";
import {
  focusField,
  hasErrors,
  nothingAnsweredYet,
  runnerFieldId,
  summarizeRunners,
  validateRunners,
  type RunnerField,
} from "./validation";
import { useStepReveal } from "./useStepReveal";
import BusyLabel from "@/components/ui/BusyLabel";
import RunnerCard, { type Participant } from "./RunnerCard";
import {
  startingAddress,
  withResolvedAddresses,
  withoutRunner,
  restoredSameAs,
} from "./RunnerAddressFields";
import "./RegistrationWizard.css";

/** The guardian answers of a runner who does not owe them. */
const NO_GUARDIAN = {
  guardianName: "",
  guardianRelationship: "",
  guardianConsent: false,
} as const;

export default function RegistrationWizardClient({
  event,
  eventId,
  registration,
  communities,
  defaultCountry,
  automaticPromos,
  promoCodesAccepted,
  initialCategoryId = "",
}: {
  event: any;
  /**
   * The event's cuid, for the API payloads. URLs use event.slug — the two
   * are not interchangeable, and a redirect is not what you want a payment
   * provider to land on.
   */
  eventId: string;
  registration?: any;
  /** Approved running clubs, alphabetical, from the server. */
  communities: string[];
  /** ISO country the phone fields start on, guessed from the request. */
  defaultCountry: string;
  /**
   * Promotions this event applies with no code typed — the early bird, the
   * group deal. Passed from the server so they are priced into the summary
   * from the first render rather than appearing a moment later, which would
   * read as the price changing.
   */
  automaticPromos: PromoTerms[];
  /**
   * Whether this event has a code a runner could type right now. Without one
   * the promo code box is left out, so nobody goes looking for a discount they
   * were never meant to have — see acceptsPromoCodes in lib/promo-store.ts.
   */
  promoCodesAccepted: boolean;
  /**
   * The option runner 1 starts with, already checked against this event and its
   * slot counts by the register page: the one they clicked on the event page,
   * or else the only option still open. Empty when there is a real choice left
   * to make — they came in through Register Now and two or more options are
   * open, or the option they clicked has since filled up.
   */
  initialCategoryId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();
  const isSuccessParam = searchParams.get("success") === "true";
  const isCancelParam = searchParams.get("cancel") === "true";

  const [step, setStep] = useState(isCancelParam && registration ? 3 : 1);
  const { panelRef, headingRef } = useStepReveal(step);
  const [participants, setParticipants] = useState<Participant[]>(
    isCancelParam && registration?.runners?.length > 0
      ? registration.runners.map((r: any, idx: number) => ({
          id: r.id || Date.now() + idx,
          categoryId: r.categoryId || "",
          firstName: r.firstName || "",
          lastName: r.lastName || "",
          email: r.email || "",
          phone: r.phone || "",
          gender: r.gender || "",
          birthdate: r.birthdate || "",
          singletSize: r.singletSize || "",
          emergencyContactName: r.emergencyContactName || "",
          emergencyContactPhone: r.emergencyContactPhone || "",
          medicalConditions: r.medicalConditions || "",
          runningCommunity: r.runningCommunity || "",
          guardianName: r.guardianName || "",
          guardianRelationship: r.guardianRelationship || "",
          guardianConsent: Boolean(r.guardianConsentAt),
          addressProvince: r.addressProvince || "",
          addressCity: r.addressCity || "",
          addressBarangay: r.addressBarangay || "",
          addressStreet: r.addressStreet || "",
          addressSameAs: null,
        }))
          // The rows hold resolved copies, so "same as" is rebuilt from them.
          .map((p: Participant, i: number, all: Participant[]) => ({
            ...p,
            addressSameAs: restoredSameAs(all)[i],
          }))
      : [
          {
            id: Date.now(),
            categoryId: initialCategoryId,
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            gender: "",
            birthdate: "",
            singletSize: "",
            emergencyContactName: "",
            emergencyContactPhone: "",
            medicalConditions: "",
            runningCommunity: "",
            ...NO_GUARDIAN,
            ...startingAddress(0),
          },
        ],
  );

  // Logistics state
  // The race's only way to hand over a kit, or null when the runner chooses.
  // A delivery-only race must start on DELIVERY: its lone card is an info
  // card, not a button, so nothing else would ever move it off PICKUP.
  const onlyMethod: LogisticsMethod | null =
    event.logisticsPickup && offersDelivery(event)
      ? null
      : offersDelivery(event)
        ? "DELIVERY"
        : "PICKUP";
  const [logisticsMethod, setLogisticsMethod] = useState<LogisticsMethod>(
    // Through the guard, not straight off the record: a registration written
    // before these codes were uppercased still says "delivery".
    onlyMethod ??
      (isCancelParam && registration
        ? asLogisticsMethod(registration.logisticsMethod)
        : "PICKUP"),
  );
  // Step 2's address, zone, split shipping and fee (useDeliveryPlan.ts).
  const delivery = useDeliveryPlan({
    event,
    runners: participants,
    logisticsMethod,
    restored: isCancelParam ? registration : null,
  });

  // Payment state. Starts on the first PayMongo method currently offered
  // (OFFERED_PAYMONGO_METHODS), so the summary never prices a card nobody can
  // see; bank transfer when none is.
  const [paymentMethod, setPaymentMethod] = useState<
    "GCASH" | "MAYA" | "QRPH" | "CARD" | "BANK_TRANSFER"
  >(
    (OFFERED_PAYMONGO_METHODS[0] ?? "BANK_TRANSFER") as
      | "GCASH"
      | "MAYA"
      | "QRPH"
      | "CARD"
      | "BANK_TRANSFER",
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderRef, setOrderRef] = useState<string>(
    isCancelParam && registration ? registration.orderRef : "",
  );
  const [proofFile, setProofFile] = useState<File | null>(null);
  // A phone screenshot is shrunk the moment it is picked (image-compress.ts),
  // so the size under the preview is what will be sent.
  const proofCompression = useImageCompression("proof");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedBankModal, setSelectedBankModal] = useState<BankAccountView | null>(
    null,
  );
  const [transactionNumber, setTransactionNumber] = useState("");
  const [showSizeGuideModal, setShowSizeGuideModal] = useState(false);
  // Required once per registration, not once per runner — the waiver this
  // is drawn from asks it the same way. Always starts unchecked, even when
  // resuming a cancelled PayMongo attempt: consent is re-affirmed on every
  // submission attempt, not carried over from an earlier one.
  const [consentGiven, setConsentGiven] = useState(false);
  // The typed signature that goes with the tick. Held here rather than in
  // ConsentWaiver so the submit handlers can check it before they send, and so
  // it can be sent — a signature the server never sees is not evidence of
  // anything. Whatever the runner types is accepted; only an empty box is an
  // error, and it waits until they have left the box or tried to submit rather
  // than nagging a name on its way in.
  const [consentSignature, setConsentSignature] = useState("");
  const [signatureTouched, setSignatureTouched] = useState(false);
  const signatureProblem = consentSignatureError(consentSignature);
  const signatureError = signatureTouched ? signatureProblem : undefined;
  const consentWaiverParagraphs = resolveConsentWaiver(event);
  // Set by the organizer on this event. Empty means bank transfer cannot
  // be offered at all — there is nowhere for the money to go.
  const bankAccounts: BankAccountView[] = event.bankAccounts ?? [];
  // Where and when a race kit is collected, as the organizer wrote it. Either
  // half may be blank, so the pickup card and the confirmation screen fall
  // back to standard wording rather than leave a gap — see lib/pickup.ts.
  const pickup = pickupDetails(event);

  // Centavos, like every other amount here. 6000 = ₱60.00. Set per event by the
  // organizer and rendered server-side, so the summary never briefly shows a
  // placeholder fee before correcting itself.
  const adminFeePerRunner = event.adminFee;

  React.useEffect(() => {
    if (isSuccessParam) {
      setOrderRef(`RM-${Math.floor(Math.random() * 1000000)}`);
    }
  }, [isSuccessParam]);

  // Clubs written in during this sitting. The server has not sent these back
  // — they are pending review — but a second runner from the same club should
  // still be able to pick the one their team-mate just typed.
  const [addedCommunities, setAddedCommunities] = useState<string[]>([]);

  const communityOptions = useMemo(() => {
    // Keyed by slug so a write-in that duplicates an approved club in different
    // casing does not show up twice.
    const bySlug = new Map<string, string>();
    for (const name of [...communities, ...addedCommunities]) {
      const key = communitySlug(name);
      if (key && !bySlug.has(key)) bySlug.set(key, name);
    }
    return [...bySlug.values()].sort((a, b) => a.localeCompare(b));
  }, [communities, addedCommunities]);

  const rememberCommunity = (name: string) => {
    setAddedCommunities((prev) =>
      prev.some((existing) => communitySlug(existing) === communitySlug(name))
        ? prev
        : [...prev, name],
    );
  };

  // Handlers
  const handleParticipantChange = (
    index: number,
    field: keyof Participant,
    value: string,
  ) => {
    const newParticipants = [...participants];
    // Names and free-text notes are stored uppercase (lib/text-case.ts), so
    // they are uppercased here rather than only in the API — the runner should
    // read back the value the database will actually hold, not discover it on
    // their confirmation email.
    newParticipants[index] = {
      ...newParticipants[index],
      [field]: isUppercasedRunnerField(field)
        ? upperCaseAsTyped(value)
        : value,
    };
    // A birthdate that no longer makes this runner 12 or under on race day
    // retires the guardian panel, and its answers go with it so nothing stale
    // is submitted.
    if (field === "birthdate" && !needsGuardianConsent(value, event.date)) {
      newParticipants[index] = { ...newParticipants[index], ...NO_GUARDIAN };
    }
    setParticipants(newParticipants);
  };

  /** The Home Address block: four parts and the "same address as" choice. */
  const handleAddressChange = (
    index: number,
    patch: Partial<
      Pick<
        Participant,
        | "addressProvince"
        | "addressCity"
        | "addressBarangay"
        | "addressStreet"
        | "addressSameAs"
      >
    >,
  ) => {
    setParticipants((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    );
  };

  /** The Parent/Guardian Consent panel's answers — one of them is a boolean. */
  const handleGuardianChange = (
    index: number,
    patch: Partial<
      Pick<Participant, "guardianName" | "guardianRelationship" | "guardianConsent">
    >,
  ) => {
    setParticipants((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    );
  };

  /**
   * Switching category can retire the size question — a band-only package has
   * nothing to size. Drop any size already typed so a runner who changed their
   * mind does not ship a stale answer to the registrants export.
   */
  const handleCategoryChange = (index: number, categoryId: string) => {
    const newParticipants = [...participants];
    const keepSize = categoryNeedsShirtSize(
      findCategory(event.categories, categoryId),
    );
    newParticipants[index] = {
      ...newParticipants[index],
      categoryId,
      singletSize: keepSize ? newParticipants[index].singletSize : "",
    };
    setParticipants(newParticipants);
  };

  /**
   * Adds `count` runners in one update.
   *
   * Functional rather than spreading the current array, because the group
   * offer adds more than one at a time and a loop over the captured
   * `participants` would add exactly one of them — and hand them all the same
   * `Date.now()` key.
   *
   * **Clamped to what a group promotion covers.** "Register 5, get 1 free"
   * covers six runners on one registration and no more, so a group of seven is
   * six here and one on a second registration — see `groupLimit` below, which
   * is declared further down the render but read here at click time. The
   * button is disabled at the ceiling; this is the same rule again where the
   * array is actually written, so no path can slip a runner past it.
   *
   * **And to `MAX_RUNNERS_PER_ORDER`** (lib/order-size.ts), the size the
   * checkout routes refuse an order above, promotion or not.
   */
  const addParticipants = (count: number) => {
    setParticipants((prev) => {
      const ceiling = Math.min(groupLimit ?? Infinity, MAX_RUNNERS_PER_ORDER);
      const room = ceiling - prev.length;
      const adding = Math.min(Math.max(1, count), room);
      if (adding < 1) return prev;

      return [
        ...prev,
        ...Array.from({ length: adding }, (_unused, offset) => ({
          id: Date.now() + offset,
          // Never copied from runner 1: the category sets the price, the bib
          // and the singlet, and a family's runners often run different
          // distances. Left blank, the picker's required check makes each
          // runner choose instead of inheriting a wrong one unnoticed.
          categoryId: "",
          // Carried over: a second runner added to one order is usually a
          // club-mate. It is a starting value, not a lock — the picker is
          // editable per runner, and a wrong club costs nothing.
          runningCommunity: prev[0].runningCommunity || "",
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          gender: "",
          birthdate: "",
          singletSize: "",
          emergencyContactName: "",
          emergencyContactPhone: "",
          medicalConditions: "",
          ...NO_GUARDIAN,
          ...startingAddress(prev.length + offset),
        })),
      ];
    });
  };

  // Zero-argument on purpose: it is wired straight to a button's onClick,
  // which would otherwise pass the click event in as the count.
  const addParticipant = () => addParticipants(1);

  const removeParticipant = (index: number) => {
    if (participants.length > 1) {
      // Anyone sharing the removed runner's address moves back to Runner 1
      // rather than being left pointing at nobody — see RunnerAddressFields.
      setParticipants(withoutRunner(participants, index));
    }
  };

  // The code the runner has applied, or null. Only its *terms* are held: what
  // it is worth is recomputed below on every render, because the order it
  // applies to keeps moving — a fifth runner joins, delivery becomes pickup —
  // and a discount frozen at the moment it was typed would quietly stop
  // matching the total being charged.
  const [promo, setPromo] = useState<PromoTerms | null>(null);

  // What the order costs, shared with the bank-transfer wizard so the two
  // summaries cannot drift apart (usePromoPricing.ts). Centavos throughout.
  const shirtSizeUpcharge = event.shirtSizeUpcharge ?? 0;
  const deliveryFee = delivery.fee;
  // The promotions the runner started under, held for 45 minutes from their
  // first keystroke (usePriceLock.ts) and sent with the order. Kept into
  // its grace once a deposit slip is picked: that runner has already paid.
  const priceLock = usePriceLock(eventId, proofFile !== null);
  const {
    sizeUpcharge,
    subtotal,
    salePrices,
    promoProblem,
    discount,
    discountAmount,
    adminFeeWaived,
    platformFee,
    isFree,
    typedApplied,
    promoOutshone,
    freeRunners,
    groupPromo,
    groupOffer,
    groupLimit,
    atGroupLimit,
    atOrderLimit,
  } = usePromoPricing({
    event,
    participants,
    promo,
    automaticPromos,
    adminFeePerRunner,
    deliveryFee,
    lockedAt: priceLock.lockedAt,
    now: priceLock.now,
  });

  // PayMongo's cut, from the same function both checkout routes recompute it
  // with (lib/free-checkout.ts). Net of the discount: it is a share of what
  // PayMongo actually processes. Shown only on step 3, where the method is
  // chosen.
  const transactionFee =
    step === 3
      ? transactionFeeFor(subtotal + deliveryFee + platformFee - discountAmount, paymentMethod)
      : 0;

  const totalAmount =
    subtotal + deliveryFee + platformFee + transactionFee - discountAmount;

  // The countdown and notices about that lock: shown only when a promotion on
  // this order ends inside it (D2).
  const {
    countdown,
    announcement,
    notice: priceNotice,
    dismissNotice: dismissPriceNotice,
  } = usePriceHold({
    priceLock,
    discount,
    promos: [...automaticPromos, promoProblem ? null : promo],
    total: totalAmount,
  });
  // Under five minutes left on a held price: a bank transfer sent now may
  // meet a renewed total, so the payment step says to wait for it. Not once
  // a slip is picked: that runner has paid, and their price is kept.
  const holdEndingSoon =
    countdown?.held === true && countdown.urgent && proofFile === null;

  // The checkout's own figures when it refused the order because a price
  // changed (a 409 PRICE_CHANGED), with the total this page had shown.
  const [priceChange, setPriceChange] = useState<{
    body: PriceChangedBody;
    shownTotal: number;
  } | null>(null);

  // The waiver sits directly above the button that actually submits the
  // registration. Online and free orders submit from step 3; a bank transfer
  // submits from step 4, after the deposit slip — the same order the
  // bank-transfer-only wizard already uses (BankTransferWizardClient).
  const waiverOnStep4 = paymentMethod === "BANK_TRANSFER" && !isFree;

  // Validation checks
  //
  // What each runner still owes, recomputed from state on every keystroke. One
  // source feeds three things that must never disagree: the red state on each
  // control, the list the dialog reads out, and where the caret lands.
  const runnerErrors = useMemo(
    () => validateRunners(participants, event),
    [participants, event],
  );

  // Nothing turns red until the runner has actually tried to move on. Marking
  // up a form they have not finished typing into is nagging, not guidance.
  const [showErrors, setShowErrors] = useState(false);

  const errorFor = (idx: number, field: RunnerField) =>
    showErrors ? runnerErrors[idx]?.[field] : undefined;

  /** The id and the two ARIA attributes an invalid control needs, in one spread. */
  const fieldAria = (idx: number, field: RunnerField) => {
    const id = runnerFieldId(idx, field);
    const message = errorFor(idx, field);
    return {
      id,
      "aria-invalid": message ? true : undefined,
      "aria-describedby": message ? `${id}-error` : undefined,
    } as const;
  };

  const handleNext = async () => {
    if (step === 1 && hasErrors(runnerErrors)) {
      setShowErrors(true);

      // Built from the gaps that are actually there, so a runner who has
      // already picked a category is never told to pick one.
      const summary = summarizeRunners(runnerErrors, event);
      const missing = summary.reduce((n, r) => n + r.labels.length, 0);
      const manyRunners = participants.length > 1;

      // A form nobody has typed into yet needs the opposite copy. There is no
      // progress to reassure anyone about, and listing all nine gaps is only
      // the form read back to them — so point at the first step instead.
      const untouched = nothingAnsweredYet(participants, runnerErrors, event);
      const choice = sellsPackages(event) ? "package" : "category";

      await alert({
        variant: "info",
        title: untouched
          ? "Let's get you registered"
          : missing === 1
            ? "One detail needs your attention"
            : `${missing} details need your attention`,
        confirmLabel: untouched ? "Get started" : "Take me there",
        message: untouched ? (
          <>
            Select a {choice} first, then fill in the runner details below.
            Every answer we still need is marked in red.
          </>
        ) : (
          <>
            <span className="block mb-3">
              Everything you have filled in is kept. Only these still need
              your attention:
            </span>
            <ul className="flex flex-col gap-2">
              {summary.map((r) => (
                <li key={r.index}>
                  {manyRunners && (
                    <span className="block text-white text-xs font-semibold uppercase tracking-wider">
                      Runner {r.runner}
                    </span>
                  )}
                  <span className="block">{r.labels.join(" \u00b7 ")}</span>
                </li>
              ))}
            </ul>
          </>
        ),
      });

      // Dismissing the dialog is the runner saying "show me" - so put them in
      // the first empty field rather than leaving them to hunt for the red.
      focusField(summary[0].firstFieldId);
      return;
    }

    const deliveryProblem = step === 2 ? delivery.problem() : null;
    if (deliveryProblem) {
      setShowErrors(true);
      await alert({
        variant: "info",
        title: deliveryProblem.title,
        message: deliveryProblem.message,
      });
      if (deliveryProblem.focusId) focusField(deliveryProblem.focusId);
      return;
    }

    setShowErrors(false);
    setStep((prev) => prev + 1);
  };

  const handleBack = () => setStep((prev) => prev - 1);

  const handleCheckout = async () => {
    // Not when the order is free: there is no deposit slip for a transfer
    // nobody is making, and step 4 exists only to collect one. A runner who
    // had already chosen Bank Transfer before applying a pacer code lands here
    // with the old choice still in state, so the free path wins over it.
    // Checked before the waiver, which a bank transfer signs on step 4.
    if (waiverOnStep4) {
      setStep(4);
      return;
    }

    // The button is already disabled without this, but the check is repeated
    // here in case state gets here some other way — the same defensive style
    // as the proofFile check in handleManualSubmit below.
    if (!consentGiven) {
      alert({
        variant: "info",
        title: "Waiver Required",
        message:
          "Please agree to the Disclaimer, Consent & Data Privacy Waiver to continue.",
      });
      return;
    }

    // The waiver is signed, not only ticked. Any name the runner types counts —
    // the box only has to be filled in — see lib/consent-signature.ts.
    if (signatureProblem) {
      setSignatureTouched(true);
      await alert({
        variant: "info",
        title: "Signature Required",
        message: signatureProblem,
      });
      focusField(SIGNATURE_FIELD_ID);
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: totalAmount,
          description: `Registration for ${event.title}`,
          customerEmail: participants[0].email,
          customerName: `${participants[0].firstName} ${participants[0].lastName}`,
          eventId: eventId,
          // Every runner carries its resolved home address; the route stores it.
          participants: withResolvedAddresses(participants),
          logisticsMethod: logisticsMethod,
          deliveryZone: delivery.zone,
          deliveryAddress: delivery.address,
          subtotal: subtotal,
          deliveryFee: deliveryFee,
          platformFee: platformFee,
          transactionFee: transactionFee,
          // A free order has no method, because nothing is being paid by one.
          // The server writes COMPLIMENTARY itself once its own arithmetic
          // agrees the total is zero — this is only what the wizard believes,
          // and it is checked like every other amount here.
          paymentMethod: isFree ? "COMPLIMENTARY" : paymentMethod,
          consentGiven: consentGiven,
          consentSignature: consentSignature,
          // The code the runner typed, and only that. The amount it is worth is
          // the server's to work out again, exactly like the subtotal above it.
          // Not `discount.code`: when an automatic promotion wins, that is its
          // name, and the server applies those on its own — see
          // resolveDiscount in lib/promo-store.ts.
          promoCode: promo && !promoProblem ? promo.code : "",
          // The moment the runner started, signed; never an amount. A missing
          // or lapsed lock prices the order at now, as before locks existed.
          priceLock: priceLock.token ?? "",
        }),
      });

      const data = await response.json();

      if (response.ok && data.checkout_url) {
        window.location.href = data.checkout_url;
      } else if (response.status === 409 && isPriceChanged(data)) {
        setPriceChange({ body: data, shownTotal: totalAmount });
        setIsProcessing(false);
      } else {
        alert(
          data.error ||
            "Failed to create checkout session. Please check your PayMongo API keys in .env.local.",
        );
        setIsProcessing(false);
      }
    } catch (error) {
      console.error(error);
      alert("An unexpected error occurred.");
      setIsProcessing(false);
    }
  };

  const pickProof = async (picked: File) => {
    const file = await proofCompression.compress(picked);
    if (file) setProofFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void pickProof(e.target.files[0]);
    }
  };

  const handleManualSubmit = async () => {
    if (!proofFile) {
      alert({
        variant: "info",
        title: "Proof of Payment Required",
        message: "Please upload your deposit slip or proof of payment.",
      });
      return;
    }

    // A bank transfer signs the waiver here on step 4, just above this
    // button. The button is disabled without it; this repeats the check.
    if (!consentGiven) {
      alert({
        variant: "info",
        title: "Waiver Required",
        message:
          "Please agree to the Disclaimer, Consent & Data Privacy Waiver to continue.",
      });
      return;
    }

    // The waiver is signed, not only ticked. Any name the runner types counts —
    // the box only has to be filled in — see lib/consent-signature.ts.
    if (signatureProblem) {
      setSignatureTouched(true);
      await alert({
        variant: "info",
        title: "Signature Required",
        message: signatureProblem,
      });
      focusField(SIGNATURE_FIELD_ID);
      return;
    }

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append("proofFile", proofFile);

      // Append primitive registration data
      formData.append("eventId", eventId);
      formData.append("customerEmail", participants[0].email);
      formData.append(
        "customerName",
        `${participants[0].firstName} ${participants[0].lastName}`,
      );
      formData.append("logisticsMethod", logisticsMethod);
      formData.append("deliveryZone", delivery.zone || "");
      formData.append("deliveryAddress", delivery.address);
      formData.append("subtotal", subtotal.toString());
      formData.append("deliveryFee", deliveryFee.toString());
      formData.append("platformFee", platformFee.toString());
      formData.append("transactionFee", transactionFee.toString());
      formData.append("totalAmount", totalAmount.toString());
      formData.append("paymentMethod", paymentMethod);
      formData.append("transactionNumber", transactionNumber);
      formData.append("consentGiven", String(consentGiven));
      formData.append("consentSignature", consentSignature);
      // The code the runner typed, and only that. The amount it is worth is
      // the server's to work out again, exactly like the subtotal above it.
      // Not `discount.code`: when an automatic promotion wins, that is its
      // name, and the server applies those on its own — see resolveDiscount
      // in lib/promo-store.ts.
      formData.append("promoCode", promo && !promoProblem ? promo.code : "");
      // The moment the runner started, signed; never an amount.
      formData.append("priceLock", priceLock.token ?? "");

      // Append complex data as JSON string
      // Every runner carries its resolved home address; the route stores it.
      formData.append(
        "participants",
        JSON.stringify(withResolvedAddresses(participants)),
      );

      const response = await fetch("/api/checkout/manual", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        // Redirect to success UI within this wizard
        router.push(
          `/events/${event.slug}/register?success=true&orderRef=${data.orderRef}`,
        );
      } else if (response.status === 409 && isPriceChanged(data)) {
        // Inline, not an alert: the form stays, and the runner is shown the
        // total the server worked out — and, having paid by hand, told not to
        // send money twice.
        setPriceChange({ body: data, shownTotal: totalAmount });
        setIsProcessing(false);
      } else {
        alert(data.error || "Failed to submit registration. Please try again.");
        setIsProcessing(false);
      }
    } catch (error) {
      console.error(error);
      alert("An unexpected error occurred during submission.");
      setIsProcessing(false);
    }
  };

  if (isSuccessParam) {
    return (
      <div className="wizard-page">
        <div className="success-container py-12 t-stagger is-shown flex justify-center items-center min-h-[70vh]">
          <div className="glass-panel p-12 form-panel border border-white/10 bg-gradient-to-b from-white/5 to-transparent rounded-3xl relative overflow-hidden text-center max-w-2xl w-full t-stagger-line t-stagger-line--1">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-accent-blue/20 rounded-full blur-[80px] pointer-events-none"></div>

            <div className="relative z-10 flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-accent-blue/10 flex items-center justify-center mb-6">
                <CheckCircle2 size={48} className="text-accent-blue" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
                Registration Successful!
              </h1>
              <p className="text-secondary text-base sm:text-lg mb-6 sm:mb-8">
                You have successfully registered for{" "}
                <strong>{event.title}</strong>.
              </p>
              <p className="text-sm text-secondary mb-8 max-w-md mx-auto">
                Your registration confirmation and simulated e-receipt have been
                sent to{" "}
                <span className="text-white">
                  {registration?.customerEmail || participants[0].email}
                </span>
                .
              </p>

              <div className="w-full bg-black/40 border border-white/5 rounded-[16px] p-6 mb-8 text-left">
                <div className="flex justify-between items-center mb-3 pb-3 border-b border-white/5">
                  <span className="text-secondary text-sm">
                    Order Reference
                  </span>
                  <span className="font-mono text-white font-bold text-lg">
                    #{registration?.orderRef || orderRef}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-secondary text-sm">Total Paid</span>
                  <span className="text-accent-orange font-bold text-2xl">
                    {/* `??`, not `||`: a free order's stored total is 0, and a
                        falsy-check would throw it away and print the wizard's
                        own recomputed figure instead — which, after the round
                        trip, is a fresh form's default rather than this
                        order's. */}
                    ₱{formatPesos(registration?.totalAmount ?? totalAmount)}
                  </span>
                </div>
              </div>

              {/* Race-kit pickup, repeated here on purpose: the runner chose
                  this option two steps ago and this screen is the one they
                  screenshot. Shown only when the saved registration says
                  pickup — the wizard's own state is back at its default after
                  the round trip through the payment page, so it cannot be
                  trusted to say which option was taken. */}
              {registration &&
                asLogisticsMethod(registration.logisticsMethod) === "PICKUP" && (
                  <div className="w-full bg-black/40 border border-white/5 rounded-[16px] p-6 mb-8 text-left">
                    <div className="mb-3 text-xs font-bold uppercase tracking-wider text-secondary">
                      Race Kit Pickup
                    </div>
                    {pickup.location || pickup.schedule ? (
                      <div className="flex flex-col gap-2 text-sm">
                        {pickup.location && (
                          <div className="flex items-start gap-2">
                            <MapPin
                              size={16}
                              className="mt-[2px] shrink-0 text-accent-blue"
                            />
                            <span className="text-white">{pickup.location}</span>
                          </div>
                        )}
                        {pickup.schedule && (
                          <div className="flex items-start gap-2">
                            <Clock
                              size={16}
                              className="mt-[2px] shrink-0 text-accent-blue"
                            />
                            <span className="text-secondary">
                              {pickup.schedule}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="m-0 text-sm text-secondary">
                        {PICKUP_FALLBACK}
                      </p>
                    )}
                  </div>
                )}

              {/* Two ways out, as one set.

                  Home is what most people want; the second is the one moment
                  we know for certain that somebody has just used this app end
                  to end, which makes it the best place on the site to ask how
                  it went. It carries `?from=` so a report about the checkout
                  arrives saying which checkout.

                  The pair is sized by .btn-gradient and .btn-secondary
                  themselves — only layout utilities here (§9). The primary
                  used to carry py-4 and text-lg of its own, which is exactly
                  the drift .btn-secondary was written to stop: a quiet button
                  matching the class beside a loud one that does not would read
                  as two controls from two different sites. */}
              <div className="flex w-full flex-col gap-3 sm:flex-row">
                <button
                  className="btn-gradient w-full shadow-xl shadow-accent-orange/20 sm:flex-1"
                  onClick={() => router.push("/")}
                >
                  Return to Homepage
                </button>
                <Link
                  href={`/feedback?from=${encodeURIComponent(
                    `/events/${event.slug}/register`,
                  )}`}
                  className="btn-secondary w-full no-underline sm:flex-1"
                >
                  <LinkPendingIcon>
                    <MessageSquareHeart size={18} aria-hidden="true" className="shrink-0" />
                  </LinkPendingIcon>
                  <span>Share Feedback</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-page">
      <div className="wizard-container py-12 t-stagger is-shown">
        {/* Sidebar Summary */}
        <aside className="wizard-sidebar t-stagger-line t-stagger-line--1">
          <div className="glass-panel sticky-sidebar p-5 sm:p-8 border border-white/10 bg-gradient-to-b from-white/5 to-transparent rounded-3xl">
            <WizardEventHeader event={event} />

            <OrderSummary
              categories={event.categories}
              participants={participants}
              discount={discount}
              sizeUpcharge={sizeUpcharge}
              deliveryFee={
                logisticsMethod === "DELIVERY"
                  ? { amount: deliveryFee, label: delivery.feeLabel }
                  : null
              }
              platformFee={platformFee}
              waivedPlatformFee={
                adminFeeWaived ? adminFeePerRunner * participants.length : null
              }
              transactionFee={
                step === 3 && paymentMethod !== "BANK_TRANSFER" && !isFree
                  ? transactionFee
                  : null
              }
              totalAmount={totalAmount}
              countdown={countdown}
              announcement={announcement}
              priceNotice={priceNotice}
              onDismissPriceNotice={dismissPriceNotice}
            />

            {/* A free order has no deposit slip to upload, so the fourth step
                is gone and the rail says three — the same rule that hides the
                payment methods on step 3. */}
            <StepRail
              className="mt-10"
              ariaLabel="Registration progress"
              current={step - 1}
              labels={[
                "Runners",
                "Logistics",
                isFree ? "Review" : "Payment",
                ...(!isFree && (paymentMethod === "BANK_TRANSFER" || step === 4)
                  ? ["Proof"]
                  : []),
              ]}
            />
          </div>
        </aside>

        {/* Main Wizard Form */}
        {/* The first input or change anywhere in the form takes the price
            lock; loading the page does not (D1). */}
        <section
          ref={panelRef}
          className="wizard-content t-stagger-line t-stagger-line--2"
          onInputCapture={priceLock.start}
          onChangeCapture={priceLock.start}
        >
          {/* overflow-clip, not overflow-hidden: the glow below overhangs the
              right edge, and a "hidden" box is still a scroll container, so
              focusing a field (focusField's scrollIntoView) slid the whole
              form sideways under the clip and left it there for every later
              step. A "clip" box cannot be scrolled at all. */}
          <div className="glass-panel p-8 form-panel border border-white/10 bg-gradient-to-b from-white/5 to-transparent rounded-3xl relative overflow-clip">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent-orange/5 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none"></div>

            {/* Header / Back button */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6 sm:mb-8 pb-5 sm:pb-6 border-b border-white/10 relative z-10">
              {step > 1 && (
                <button
                  className="flex items-center gap-2 text-secondary hover:text-white transition-colors"
                  onClick={handleBack}
                >
                  <ArrowLeft size={20} />{" "}
                  <span className="font-bold">Back</span>
                </button>
              )}
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="text-2xl sm:text-3xl font-bold text-white tracking-tight m-0 focus:outline-none"
              >
                {step === 1 &&
                  (sellsPackages(event)
                    ? "Runner Details & Packages"
                    : "Runner Details & Categories")}
                {step === 2 && "Logistics"}
                {step === 3 && (isFree ? "Review & Confirm" : "Checkout & Payment")}
                {step === 4 && "Upload Proof of Payment"}
              </h2>
            </div>

            {/* STEP 1: Categories & Details */}
            {step === 1 && (
              <div className="step-content relative z-10 animate-fade-in">
                <p className="text-secondary text-base sm:text-lg mb-6 sm:mb-8">
                  {sellsPackages(event)
                    ? "Select a registration package and fill out the details for each runner. You can add multiple runners in one transaction."
                    : "Select a distance category and fill out the details for each runner. You can add multiple runners in one transaction."}
                </p>

                {participants.map((p, idx) => (
                  <RunnerCard
                    key={p.id}
                    event={event}
                    index={idx}
                    runner={p}
                    runners={participants}
                    isFree={freeRunners.has(idx)}
                    salePrices={salePrices}
                    shirtSizeUpcharge={shirtSizeUpcharge}
                    defaultCountry={defaultCountry}
                    communityOptions={communityOptions}
                    addressErrors={showErrors ? (runnerErrors[idx] ?? {}) : {}}
                    errorFor={errorFor}
                    fieldAria={fieldAria}
                    onRemove={removeParticipant}
                    onCategoryChange={handleCategoryChange}
                    onChange={handleParticipantChange}
                    onGuardianChange={handleGuardianChange}
                    onAddressChange={handleAddressChange}
                    onAddCommunity={rememberCommunity}
                    onOpenSizeGuide={() => setShowSizeGuideModal(true)}
                  />
                ))}

                {groupOffer && (
                  <FreeSlotOffer
                    needed={groupOffer.needed}
                    free={groupOffer.free}
                    onAdd={() => addParticipants(groupOffer.needed)}
                  />
                )}

                {/* The other end of that offer: the group is whole, the button
                    below is disabled, and this is the reason why. */}
                {atGroupLimit && groupPromo && groupLimit !== null && (
                  <GroupLimitNotice
                    id="group-limit-notice"
                    runners={participants.length}
                    limit={groupLimit}
                    free={groupPromo.getQuantity ?? 0}
                    label={describePromo(groupPromo)}
                  />
                )}

                {atOrderLimit && (
                  <p
                    id="order-limit-notice"
                    role="status"
                    className="mt-4 m-0 rounded-[16px] border border-white/10 bg-white/5 p-5 text-sm leading-relaxed text-secondary"
                  >
                    {ORDER_SIZE_LIMIT_MESSAGE}
                  </p>
                )}

                <button
                  className="w-full mt-4 flex items-center justify-center gap-2 border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/30 text-white font-bold py-4 rounded-[16px] transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-white/10 disabled:hover:bg-white/5"
                  onClick={addParticipant}
                  disabled={atGroupLimit || atOrderLimit}
                  aria-describedby={
                    atGroupLimit
                      ? "group-limit-notice"
                      : atOrderLimit
                        ? "order-limit-notice"
                        : undefined
                  }
                >
                  <Plus size={20} /> Add Another Runner
                </button>

                <div className="form-actions mt-10 flex justify-end">
                  <button
                    className="btn-gradient flex items-center justify-center gap-2 px-10 py-4 rounded-[16px] text-lg group shadow-xl shadow-accent-orange/20"
                    onClick={handleNext}
                  >
                    Next: Logistics{" "}
                    <ChevronRight
                      size={20}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Logistics */}
            {step === 2 && (
              <div className="step-content">
                {/* A question only when there is a choice. With one method
                    the lone card is the answer, so the line says what the
                    race offers instead of asking the runner to pick. */}
                <p className="text-secondary mb-6">
                  {!onlyMethod
                    ? "How would you like to receive your race kits?"
                    : onlyMethod === "DELIVERY"
                      ? "Race kits for this race are delivered to your address."
                      : pickupOnlyLine(event)}
                </p>

                <div className={`grid grid-cols-1 gap-4 mb-8 ${onlyMethod ? "" : "sm:grid-cols-2"}`}>
                  {event.logisticsPickup && (
                    <div
                      className={`group relative overflow-hidden border rounded-[16px] p-6 transition-all ${
                        onlyMethod
                          ? "border-white/10 bg-white/[0.03]"
                          : logisticsMethod === "PICKUP"
                            ? "cursor-pointer border-accent-blue bg-accent-blue/10 shadow-[0_0_20px_rgba(0,122,255,0.15)]"
                            : "cursor-pointer border-white/10 bg-black/40 hover:border-white/30 hover:bg-white/5"
                      }`}
                      onClick={onlyMethod ? undefined : () => setLogisticsMethod("PICKUP")}
                    >
                      {!onlyMethod && (
                        <div
                          className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 transition-colors ${logisticsMethod === "PICKUP" ? "bg-accent-blue/20" : "bg-white/5 group-hover:bg-white/10"}`}
                        ></div>
                      )}
                      <div className="relative z-10 flex justify-between items-start mb-3">
                        <div className="font-bold text-2xl text-white">
                          {pickupLabel(event)}
                        </div>
                        {!onlyMethod && logisticsMethod === "PICKUP" && (
                          <CheckCircle2
                            size={24}
                            className="text-accent-blue"
                          />
                        )}
                      </div>
                      {/* Where and when, in the organizer's own words. A
                          runner choosing pickup needs the address at the
                          moment they choose it, not in a later email — and
                          what the organizer has not yet settled falls back to
                          a sentence that says so (lib/pickup.ts). */}
                      <div className="relative z-10 text-sm text-secondary mb-4 flex flex-col gap-1.5">
                        {pickup.location || pickup.schedule ? (
                          <>
                            {pickup.location && (
                              <span className="flex items-start gap-1.5">
                                <MapPin
                                  size={14}
                                  className="mt-[3px] shrink-0 text-accent-blue"
                                />
                                <span className="text-white/90">
                                  {pickup.location}
                                </span>
                              </span>
                            )}
                            {pickup.schedule && (
                              <span className="flex items-start gap-1.5">
                                <Clock
                                  size={14}
                                  className="mt-[3px] shrink-0 text-accent-blue"
                                />
                                <span>{pickup.schedule}</span>
                              </span>
                            )}
                          </>
                        ) : (
                          <span>{PICKUP_FALLBACK}</span>
                        )}
                      </div>
                      <div className="relative z-10 font-bold text-accent-blue">
                        FREE
                      </div>
                    </div>
                  )}

                  {offersDelivery(event) && (
                    <div
                      className={`group relative overflow-hidden border rounded-[16px] p-6 transition-all ${
                        onlyMethod
                          ? "border-white/10 bg-white/[0.03]"
                          : logisticsMethod === "DELIVERY"
                            ? "cursor-pointer border-accent-blue bg-accent-blue/10 shadow-[0_0_20px_rgba(0,122,255,0.15)]"
                            : "cursor-pointer border-white/10 bg-black/40 hover:border-white/30 hover:bg-white/5"
                      }`}
                      onClick={onlyMethod ? undefined : () => setLogisticsMethod("DELIVERY")}
                    >
                      {!onlyMethod && (
                        <div
                          className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 transition-colors ${logisticsMethod === "DELIVERY" ? "bg-accent-blue/20" : "bg-white/5 group-hover:bg-white/10"}`}
                        ></div>
                      )}
                      <div className="relative z-10 flex justify-between items-start mb-3">
                        <div className="font-bold text-2xl text-white">
                          Door-to-Door Delivery
                        </div>
                        {!onlyMethod && logisticsMethod === "DELIVERY" && (
                          <CheckCircle2
                            size={24}
                            className="text-accent-blue"
                          />
                        )}
                      </div>
                      <div className="relative z-10 text-sm text-secondary mb-4 line-clamp-2">
                        Get your race kits delivered straight to your home
                        address nationwide.
                      </div>
                      <div className="relative z-10 font-bold text-accent-blue">
                        {needsDeliveryZoneChoice(event)
                          ? `+₱${formatPesos(
                              Math.min(...deliveryTiers(event).map((t) => t.fee)),
                            )} onwards`
                          : `+₱${formatPesos(deliveryTiers(event)[0].fee)}`}
                      </div>
                    </div>
                  )}
                </div>

                {logisticsMethod === "DELIVERY" && (
                  <DeliveryStep
                    plan={delivery}
                    event={event}
                    runners={participants}
                    showErrors={showErrors}
                    defaultCountry={defaultCountry}
                  />
                )}

                <div className="form-actions mt-10 flex justify-end animate-fade-in">
                  <button
                    className="btn-gradient flex items-center justify-center gap-2 px-10 py-4 rounded-[16px] text-lg group shadow-xl shadow-accent-orange/20"
                    onClick={handleNext}
                  >
                    Proceed to Checkout{" "}
                    <ChevronRight
                      size={20}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Checkout */}
            {step === 3 && (
              <div className="step-content relative z-10 animate-fade-in">
                <p className="text-secondary text-base sm:text-lg mb-6 sm:mb-8">
                  {isFree
                    ? "There is nothing to pay for this registration. Check your details below, sign the waiver, and you are done."
                    : "Choose how you want to pay for your registration."}
                </p>

                {/* No payment method when there is nothing to charge. The
                    cards are not merely disabled: every one of them leads to a
                    payment this runner does not owe, and PayMongo refuses a
                    ₱0 charge outright. */}
                {!isFree && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  {OFFERED_PAYMONGO_METHODS.includes("GCASH") && (
                  <div
                    className={`group relative overflow-hidden border ${paymentMethod === "GCASH" ? "border-[#007DFE] bg-[#007DFE]/10" : "border-white/10 bg-black/40 hover:border-[#007DFE]/50"} rounded-[16px] p-6 cursor-pointer transition-all flex items-center gap-4`}
                    onClick={() => setPaymentMethod("GCASH")}
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#007DFE]/10 rounded-full blur-xl -mr-12 -mt-12 group-hover:bg-[#007DFE]/20"></div>
                    <div
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentMethod === "GCASH" ? "border-[#007DFE]" : "border-white/20"}`}
                    >
                      {paymentMethod === "GCASH" && (
                        <div className="w-4 h-4 rounded-full bg-[#007DFE]"></div>
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-white text-lg">GCash</div>
                      <div className="text-sm text-secondary">
                        Pay securely via PayMongo
                      </div>
                    </div>
                  </div>
                  )}

                  {OFFERED_PAYMONGO_METHODS.includes("MAYA") && (
                  <div
                    className={`group relative overflow-hidden border ${paymentMethod === "MAYA" ? "border-[#00A164] bg-[#00A164]/10" : "border-white/10 bg-black/40 hover:border-[#00A164]/50"} rounded-[16px] p-6 cursor-pointer transition-all flex items-center gap-4`}
                    onClick={() => setPaymentMethod("MAYA")}
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#00A164]/10 rounded-full blur-xl -mr-12 -mt-12 group-hover:bg-[#00A164]/20"></div>
                    <div
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentMethod === "MAYA" ? "border-[#00A164]" : "border-white/20"}`}
                    >
                      {paymentMethod === "MAYA" && (
                        <div className="w-4 h-4 rounded-full bg-[#00A164]"></div>
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-white text-lg">Maya</div>
                      <div className="text-sm text-secondary">
                        Pay securely via PayMongo
                      </div>
                    </div>
                  </div>
                  )}

                  {OFFERED_PAYMONGO_METHODS.includes("QRPH") && (
                  <div
                    className={`group relative overflow-hidden border ${paymentMethod === "QRPH" ? "border-accent-blue bg-accent-blue/10" : "border-white/10 bg-black/40 hover:border-accent-blue/50"} rounded-[16px] p-6 cursor-pointer transition-all flex items-center gap-4`}
                    onClick={() => setPaymentMethod("QRPH")}
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-accent-blue/10 rounded-full blur-xl -mr-12 -mt-12 group-hover:bg-accent-blue/20"></div>
                    <div
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentMethod === "QRPH" ? "border-accent-blue" : "border-white/20"}`}
                    >
                      {paymentMethod === "QRPH" && (
                        <div className="w-4 h-4 rounded-full bg-accent-blue"></div>
                      )}
                    </div>
                    <div>
                      <div className="text-lg font-bold text-white">QR Ph</div>
                      <div className="text-sm text-secondary">
                        Pay securely via PayMongo
                      </div>
                    </div>
                  </div>
                  )}

                  {OFFERED_PAYMONGO_METHODS.includes("CARD") && (
                  <div
                    className={`group relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-[16px] border ${
                      paymentMethod === "CARD"
                        ? "border-accent-blue bg-accent-blue/10"
                        : "border-white/10 bg-black/40 hover:border-accent-blue/50"
                    } p-6 transition-all`}
                    onClick={() => setPaymentMethod("CARD")}
                  >
                    <div className="absolute right-0 top-0 -mr-12 -mt-12 h-24 w-24 rounded-full bg-accent-blue/10 blur-xl group-hover:bg-accent-blue/20"></div>
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                        paymentMethod === "CARD"
                          ? "border-accent-blue"
                          : "border-white/20"
                      }`}
                    >
                      {paymentMethod === "CARD" && (
                        <div className="h-4 w-4 rounded-full bg-accent-blue"></div>
                      )}
                    </div>
                    <div>
                      <div className="text-lg font-bold text-white">Credit/Debit Card</div>
                      <div className="text-sm text-secondary">
                        Visa or Mastercard via PayMongo
                      </div>
                    </div>
                  </div>
                  )}

                  {/* Offered only when the organizer has given somewhere to
                      send the money. Without an account this option would take
                      the runner to a step that cannot be completed. */}
                  {bankAccounts.length > 0 && (
                  <div
                    className={`group relative overflow-hidden border ${paymentMethod === "BANK_TRANSFER" ? "border-accent-orange bg-accent-orange/10" : "border-white/10 bg-black/40 hover:border-accent-orange/50"} rounded-[16px] p-6 cursor-pointer transition-all flex items-center gap-4`}
                    onClick={() => setPaymentMethod("BANK_TRANSFER")}
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-accent-orange/10 rounded-full blur-xl -mr-12 -mt-12 group-hover:bg-accent-orange/20"></div>
                    <div
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentMethod === "BANK_TRANSFER" ? "border-accent-orange" : "border-white/20"}`}
                    >
                      {paymentMethod === "BANK_TRANSFER" && (
                        <div className="w-4 h-4 rounded-full bg-accent-orange"></div>
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-white text-lg">
                        Bank Transfer
                      </div>
                      <div className="text-sm text-secondary">
                        Manual upload of deposit slip
                      </div>
                    </div>
                  </div>
                  )}
                </div>
                )}

                {/* Only when a code could actually be typed. An event running
                    automatic promotions alone, or none, shows no box — they
                    are already on the order, and an empty box reads as a
                    discount this runner was never given. */}
                {promoCodesAccepted && (
                  <PromoCodeField
                    eventId={eventId}
                    promo={promo}
                    applied={promoOutshone ? null : typedApplied}
                    problem={promoProblem}
                    note={promoOutshone}
                    onApply={setPromo}
                    onRemove={() => setPromo(null)}
                  />
                )}

                <div className="checkout-total-box bg-accent-orange/10 border border-accent-orange/20 rounded-3xl mb-8 text-center py-10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-accent-orange/20 rounded-full blur-[80px] -mr-32 -mt-32"></div>
                  <div className="relative z-10 text-secondary mb-2 uppercase tracking-widest text-sm font-bold">
                    {isFree ? FREE_ORDER_TOTAL_LABEL : "Total Amount to Pay"}
                  </div>
                  <div className="relative z-10 text-5xl font-extrabold text-white">
                    ₱{formatPesos(totalAmount)}
                  </div>
                  {/* Said out loud rather than left for the runner to infer
                      from a zero: a total of ₱0 on a page that has always
                      asked for money reads as a page that has not finished
                      loading. */}
                  {isFree && (
                    <div className="relative z-10 mt-2 text-secondary text-sm">
                      Your entry is covered — there is no payment step.
                    </div>
                  )}
                </div>

                {!waiverOnStep4 && (
                  <ConsentWaiver
                    paragraphs={consentWaiverParagraphs}
                    checked={consentGiven}
                    onChange={setConsentGiven}
                    signature={consentSignature}
                    onSignatureChange={setConsentSignature}
                    signatureError={signatureError}
                    onSignatureBlur={() => setSignatureTouched(true)}
                  />
                )}

                {priceChange && (
                  <PriceChangedNotice
                    change={priceChange.body}
                    shownTotal={priceChange.shownTotal}
                    bankTransfer={false}
                  />
                )}

                <div className="form-actions mt-10 flex justify-end">
                  <button
                    className={`btn-gradient flex items-center justify-center gap-2 px-10 py-4 text-lg group shadow-xl shadow-accent-orange/20 ${isProcessing || (!waiverOnStep4 && !consentGiven) ? "opacity-50 pointer-events-none" : ""}`}
                    onClick={handleCheckout}
                    disabled={isProcessing || (!waiverOnStep4 && !consentGiven)}
                  >
                    {isProcessing ? (
                      <BusyLabel>
                        {isFree
                          ? "Completing your registration"
                          : paymentMethod !== "BANK_TRANSFER"
                            ? "Connecting to PayMongo"
                            : "Processing"}
                      </BusyLabel>
                    ) : isFree ? (
                      FREE_ORDER_SUBMIT_LABEL
                    ) : paymentMethod !== "BANK_TRANSFER" ? (
                      `Pay ₱${formatPesos(totalAmount)}`
                    ) : (
                      "Upload Deposit Slip"
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Bank Transfer Upload */}
            {step === 4 && (
              <div className="step-content relative z-10 animate-fade-in">
                <p className="text-secondary text-base sm:text-lg mb-6 sm:mb-8 leading-relaxed">
                  You have selected Manual Bank Transfer. Please choose a bank
                  below to view our account details and transfer{" "}
                  <strong className="text-white font-bold tracking-wide">
                    ₱{formatPesos(totalAmount)}
                  </strong>
                  . After payment, upload your deposit slip.
                </p>

                {holdEndingSoon && <WaitForFreshPrice />}

                <h4 className="mb-4 text-accent-blue font-bold tracking-wide">
                  Select a Bank for Transfer
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
                  {bankAccounts.map((bank) => (
                    <div
                      key={bank.id}
                      className="group relative overflow-hidden border border-white/10 bg-black/40 hover:border-accent-blue hover:bg-white/5 rounded-[16px] p-5 sm:p-6 cursor-pointer transition-all text-center"
                      onClick={() => setSelectedBankModal(bank)}
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-accent-blue/10 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-accent-blue/20 transition-colors"></div>
                      <div className="relative z-10 font-bold text-lg sm:text-2xl text-white mb-1">
                        {bank.bankName}
                      </div>
                      <div className="relative z-10 text-sm text-secondary">
                        {bank.qrImageUrl
                          ? "Click to view details & QR"
                          : "Click to view account details"}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className={`relative overflow-hidden border-2 border-dashed rounded-3xl p-6 sm:p-12 text-center transition-all cursor-pointer ${isDragging ? "border-accent-blue bg-accent-blue/10" : "border-white/20 bg-black/20 hover:border-white/40 hover:bg-white/5"}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (
                      e.dataTransfer.files &&
                      e.dataTransfer.files.length > 0
                    ) {
                      void pickProof(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  <input
                    type="file"
                    accept={acceptAttribute("proof")}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    onChange={handleFileChange}
                    id="proof-upload"
                  />
                  <div className="flex flex-col items-center gap-2 text-center relative z-10">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-2 border border-white/10">
                      <UploadCloud size={36} className="text-accent-blue" />
                    </div>
                    <div className="text-2xl font-bold text-white">
                      Drag & Drop your receipt here
                    </div>
                    <div className="text-secondary mb-2">
                      or click to browse from your device
                    </div>
                    <div className="text-xs text-secondary/50 mt-2 bg-black/40 px-4 py-2 rounded-full border border-white/5">
                      Supports {describeUploadTypes("proof")} (Max {MAX_UPLOAD_MB}MB)
                    </div>
                  </div>
                </div>

                {proofCompression.optimizing ? (
                  <div role="status" className="animate-fade-in p-4 bg-white/5 border border-white/10 rounded-[16px] mt-4 text-sm text-secondary">
                    <BusyLabel>Optimizing image</BusyLabel>
                  </div>
                ) : proofFile && (
                  <div className="file-preview animate-fade-in p-4 bg-white/5 border border-white/10 rounded-[16px] mt-4 flex items-center justify-between">
                    <div className="file-preview-meta flex items-center gap-3 min-w-0">
                      {/* A PDF is not a picture, and a picture icon beside one
                          reads as a thumbnail that failed to draw. */}
                      {proofFile.type === PDF_TYPE ? (
                        <FileText size={24} className="text-accent-blue shrink-0" />
                      ) : (
                        <FileImage size={24} className="text-accent-blue shrink-0" />
                      )}
                      <div className="file-preview-meta min-w-0">
                        <div
                          className="file-preview-name font-bold text-white text-sm"
                          title={proofFile.name}
                        >
                          {proofFile.name}
                        </div>
                        <div className="text-xs text-secondary">
                          {(proofFile.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                    </div>
                    <button
                      className="text-secondary hover:text-red-400 bg-black/40 hover:bg-red-500/10 p-2 rounded-full transition-all shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProofFile(null);
                        const fileInput = document.getElementById(
                          "proof-upload",
                        ) as HTMLInputElement;
                        if (fileInput) fileInput.value = "";
                      }}
                      title="Remove file"
                    >
                      <X size={20} />
                    </button>
                  </div>
                )}

                <div className="input-group full-width mt-6 animate-fade-in">
                  <label className="text-white font-bold">
                    Transaction Number / Reference Number{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={transactionNumber}
                    onChange={(e) => setTransactionNumber(e.target.value)}
                    placeholder="Enter the reference number from your bank receipt"
                    required
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:border-accent-blue transition-all"
                  />
                </div>

                <ConsentWaiver
                  paragraphs={consentWaiverParagraphs}
                  checked={consentGiven}
                  onChange={setConsentGiven}
                  signature={consentSignature}
                  onSignatureChange={setConsentSignature}
                  signatureError={signatureError}
                  onSignatureBlur={() => setSignatureTouched(true)}
                />

                {priceChange && (
                  <PriceChangedNotice
                    change={priceChange.body}
                    shownTotal={priceChange.shownTotal}
                    bankTransfer
                  />
                )}

                <div className="form-actions mt-10 flex justify-end">
                  <button
                    className={`btn-gradient flex items-center justify-center gap-2 px-10 py-4 text-lg group shadow-xl shadow-accent-orange/20 ${isProcessing || !proofFile || proofCompression.optimizing || !transactionNumber.trim() || !consentGiven ? "opacity-50 pointer-events-none" : ""}`}
                    onClick={handleManualSubmit}
                    disabled={
                      isProcessing ||
                      !proofFile || proofCompression.optimizing ||
                      !transactionNumber.trim() ||
                      !consentGiven
                    }
                  >
                    {isProcessing
                      ? "Submitting Registration"
                      : "Submit & Finish Registration"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {selectedBankModal && (
        <BankDetailsModal
          bank={selectedBankModal}
          onClose={() => setSelectedBankModal(null)}
        />
      )}

      {showSizeGuideModal && (
        <SizeGuideModal
          upcharge={shirtSizeUpcharge}
          imageUrl={event.sizeChartImageUrl}
          onClose={() => setShowSizeGuideModal(false)}
        />
      )}

      {/* isProcessing covers two different waits in this wizard: creating the
          PayMongo checkout (and then loading PayMongo), or — once a runner
          switched to bank transfer — uploading their deposit slip. */}
      <RunnerOverlay
        open={isProcessing}
        title={
          paymentMethod === "BANK_TRANSFER"
            ? "Submitting your registration"
            : "Preparing your secure payment"
        }
        slowTitle={
          paymentMethod === "BANK_TRANSFER"
            ? "Still uploading, almost there"
            : "Still connecting to PayMongo"
        }
        hint={
          paymentMethod === "BANK_TRANSFER"
            ? "Uploading your proof of payment. This can take a few seconds on mobile data, so please keep this page open."
            : "You'll be taken to PayMongo to pay. Please keep this page open."
        }
      />
    </div>
  );
}
