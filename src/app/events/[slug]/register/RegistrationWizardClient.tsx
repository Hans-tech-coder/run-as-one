"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  UploadCloud,
  FileImage,
  X,
  Calendar,
} from "lucide-react";
import { formatPesos } from "@/lib/money";
import {
  deliveryTiers,
  offersDelivery,
  deliveryFeeFor,
  defaultDeliveryZone,
  type DeliveryZone,
} from "./delivery";
import { type BankAccountView } from "@/lib/bank-accounts";
import BankDetailsModal from "./BankDetailsModal";
import SizeGuideModal from "./SizeGuideModal";
import CategoryPicker from "./CategoryPicker";
import CommunityPicker from "./CommunityPicker";
import ConsentWaiver from "./ConsentWaiver";
import PhoneField from "./PhoneField";
import GenderField from "./GenderField";
import { resolveConsentWaiver } from "@/lib/consent-waiver";
import ShirtSizeField from "./ShirtSizeField";
import {
  categoryNeedsShirtSize,
  findCategory,
  totalShirtSizeUpcharge,
} from "@/lib/shirt-size";
import { communitySlug } from "@/lib/running-community";
import { sellsPackages } from "@/lib/event-type";
import EventImage from "@/components/EventImage";
import { useAlert } from "@/components/ui/AlertProvider";
import FieldError from "./FieldError";
import {
  focusField,
  hasErrors,
  nothingAnsweredYet,
  runnerFieldId,
  summarizeRunners,
  validateRunners,
  type RunnerField,
} from "./validation";
import "./RegistrationWizard.css";

interface Participant {
  id: number;
  categoryId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  birthdate: string;
  singletSize: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  medicalConditions: string;
  runningCommunity: string;
}

export default function RegistrationWizardClient({
  event,
  eventId,
  registration,
  communities,
  defaultCountry,
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
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();
  const isSuccessParam = searchParams.get("success") === "true";
  const isCancelParam = searchParams.get("cancel") === "true";

  const [step, setStep] = useState(isCancelParam && registration ? 3 : 1);
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
        }))
      : [
          {
            id: Date.now(),
            categoryId: "",
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
          },
        ],
  );

  // Logistics state
  const [logisticsMethod, setLogisticsMethod] = useState<"pickup" | "delivery">(
    isCancelParam && registration
      ? registration.logisticsMethod || "pickup"
      : "pickup",
  );
  const [deliveryAddress, setDeliveryAddress] = useState(
    isCancelParam && registration ? registration.deliveryAddress || "" : "",
  );
  const [deliveryZone, setDeliveryZone] = useState<DeliveryZone | null>(
    isCancelParam && registration?.deliveryZone
      ? registration.deliveryZone
      : defaultDeliveryZone(event),
  );

  const availableTiers = deliveryTiers(event);
  const selectedTier = availableTiers.find((t) => t.zone === deliveryZone);

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState<
    "gcash" | "maya" | "qrph" | "card" | "bank_transfer"
  >("gcash");
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderRef, setOrderRef] = useState<string>(
    isCancelParam && registration ? registration.orderRef : "",
  );
  const [proofFile, setProofFile] = useState<File | null>(null);
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
  const consentWaiverParagraphs = resolveConsentWaiver(event);
  // Set by the organizer on this event. Empty means bank transfer cannot
  // be offered at all — there is nowhere for the money to go.
  const bankAccounts: BankAccountView[] = event.bankAccounts ?? [];

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
    newParticipants[index] = { ...newParticipants[index], [field]: value };
    setParticipants(newParticipants);
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

  const addParticipant = () => {
    setParticipants([
      ...participants,
      {
        id: Date.now(),
        categoryId: participants[0].categoryId || "",
        // Carried over for the same reason as the category: a second runner
        // added to one order is usually a club-mate or family member. It is a
        // starting value, not a lock — the picker is editable per runner.
        runningCommunity: participants[0].runningCommunity || "",
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
      },
    ]);
  };

  const removeParticipant = (index: number) => {
    if (participants.length > 1) {
      const newParticipants = [...participants];
      newParticipants.splice(index, 1);
      setParticipants(newParticipants);
    }
  };

  // Calculations. Every amount below is in centavos (integers), so these sums
  // are exact — no floating point drift.
  const categoryTotal = participants.reduce((total, p) => {
    const cat = event.categories.find((c: any) => c.id === p.categoryId);
    return total + (cat ? cat.price : 0);
  }, 0);

  // 4XL and above cost the organizer more to produce, so an event may add a
  // flat amount for each runner in one. Charged only to runners who are
  // actually getting a shirt — see totalShirtSizeUpcharge.
  const shirtSizeUpcharge = event.shirtSizeUpcharge ?? 0;
  const sizeUpcharge = totalShirtSizeUpcharge(
    participants,
    event.categories,
    shirtSizeUpcharge,
  );

  // The surcharge is part of what the runner pays for goods, so it belongs in
  // the subtotal the server re-derives and checks at checkout.
  const subtotal = categoryTotal + sizeUpcharge;

  const deliveryFee =
    logisticsMethod === "delivery" ? deliveryFeeFor(event, deliveryZone) : 0;

  // Platform Fee (DB-driven per participant)
  const platformFee = adminFeePerRunner * participants.length;

  // Dynamic Transaction Fee based on payment method
  let transactionFee = 0;
  if (step === 3 && paymentMethod !== "bank_transfer") {
    const baseAmountForFee = subtotal + deliveryFee + platformFee; // Include admin fee in computation as requested

    // Using VAT-inclusive rates (PayMongo deducts this from the total gross amount)
    // Formula to perfectly cover the fee: Fee = (Base * rate + fixed) / (1 - rate)
    if (paymentMethod === "gcash") {
      const rate = 0.025; // 2.5%
      transactionFee = (baseAmountForFee * rate) / (1 - rate);
    } else if (paymentMethod === "maya") {
      const rate = 0.02; // 2.0%
      transactionFee = (baseAmountForFee * rate) / (1 - rate);
    } else if (paymentMethod === "qrph") {
      const rate = 0.015; // 1.5%
      transactionFee = (baseAmountForFee * rate) / (1 - rate);
    } else if (paymentMethod === "card") {
      const rate = 0.035; // 3.5%
      const fixed = 1500; // ₱15.00 in centavos
      transactionFee = (baseAmountForFee * rate + fixed) / (1 - rate);
    }

    // Round up to the next whole centavo so the merchant never absorbs a
    // fraction. This is the only place a non-integer can appear, because the
    // rate multiplication above produces a fractional centavo.
    transactionFee = Math.ceil(transactionFee);
  }

  const totalAmount = subtotal + deliveryFee + platformFee + transactionFee;

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

  const deliveryAddressError =
    showErrors &&
    logisticsMethod === "delivery" &&
    deliveryZone !== null &&
    deliveryAddress.trim() === ""
      ? "Enter a complete delivery address"
      : undefined;

  const validateStep2 = () => {
    if (logisticsMethod === "pickup") return true;
    return deliveryZone !== null && deliveryAddress.trim() !== "";
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
            ? "One detail still missing"
            : `${missing} details still missing`,
        confirmLabel: untouched ? "Get started" : "Take me there",
        message: untouched ? (
          <>
            Select a {choice} first, then fill in the runner details below.
            Every answer we still need is marked in red.
          </>
        ) : (
          <>
            <span className="block mb-3">
              Everything you have filled in is kept. Only these are still
              blank:
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

    if (step === 2 && !validateStep2()) {
      setShowErrors(true);
      await alert({
        variant: "info",
        title:
          deliveryZone === null ? "Choose a delivery area" : "Address needed",
        message:
          deliveryZone === null
            ? "Please choose whether delivery is inside or outside the province."
            : "Please provide a complete delivery address so the kit reaches you.",
      });
      if (deliveryZone !== null) focusField("delivery-address");
      return;
    }

    setShowErrors(false);
    setStep((prev) => prev + 1);
  };

  const handleBack = () => setStep((prev) => prev - 1);

  const handleCheckout = async () => {
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

    if (paymentMethod === "bank_transfer") {
      setStep(4);
      return;
    }

    setIsProcessing(true);
    try {
      const baseUrl = window.location.origin;
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: totalAmount,
          description: `Registration for ${event.title}`,
          successUrl: `${baseUrl}/events/${event.slug}/register?success=true`,
          cancelUrl: `${baseUrl}/events/${event.slug}/register`,
          customerEmail: participants[0].email,
          customerName: `${participants[0].firstName} ${participants[0].lastName}`,
          eventId: eventId,
          participants: participants,
          logisticsMethod: logisticsMethod,
          deliveryZone: deliveryZone,
          deliveryAddress: deliveryAddress,
          subtotal: subtotal,
          deliveryFee: deliveryFee,
          platformFee: platformFee,
          transactionFee: transactionFee,
          paymentMethod: paymentMethod,
          consentGiven: consentGiven,
        }),
      });

      const data = await response.json();

      if (response.ok && data.checkout_url) {
        window.location.href = data.checkout_url;
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setProofFile(e.target.files[0]);
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

    // Reaching step 4 already required checking the box on step 3 — this
    // guards the case where that never happened for some other reason.
    if (!consentGiven) {
      alert({
        variant: "info",
        title: "Waiver Required",
        message:
          "Please agree to the Disclaimer, Consent & Data Privacy Waiver to continue.",
      });
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
      formData.append("deliveryZone", deliveryZone || "");
      formData.append("deliveryAddress", deliveryAddress || "");
      formData.append("subtotal", subtotal.toString());
      formData.append("deliveryFee", deliveryFee.toString());
      formData.append("platformFee", platformFee.toString());
      formData.append("transactionFee", transactionFee.toString());
      formData.append("totalAmount", totalAmount.toString());
      formData.append("paymentMethod", paymentMethod);
      formData.append("transactionNumber", transactionNumber);
      formData.append("consentGiven", String(consentGiven));

      // Append complex data as JSON string
      formData.append("participants", JSON.stringify(participants));

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
        <div className="container success-container py-12 t-stagger is-shown flex justify-center items-center min-h-[70vh]">
          <div className="glass-panel p-12 form-panel border border-white/10 bg-gradient-to-b from-white/5 to-transparent rounded-3xl relative overflow-hidden text-center max-w-2xl w-full t-stagger-line t-stagger-line--1">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-accent-blue/20 rounded-full blur-[80px] pointer-events-none"></div>

            <div className="relative z-10 flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-accent-blue/10 flex items-center justify-center mb-6">
                <CheckCircle2 size={48} className="text-accent-blue" />
              </div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight mb-4">
                Registration Successful!
              </h1>
              <p className="text-secondary text-lg mb-8">
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
                  <span className="text-accent-orange font-bold text-xl">
                    ₱{formatPesos(registration?.totalAmount || totalAmount)}
                  </span>
                </div>
              </div>

              <button
                className="btn-gradient w-full py-4 text-lg font-bold shadow-xl shadow-accent-orange/20"
                onClick={() => router.push("/")}
              >
                Return to Homepage
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-page">
      <div className="container wizard-container py-12 t-stagger is-shown">
        {/* Sidebar Summary */}
        <aside className="wizard-sidebar t-stagger-line t-stagger-line--1">
          <div className="glass-panel sticky-sidebar p-8 border border-white/10 bg-gradient-to-b from-white/5 to-transparent rounded-3xl">
            <div className="event-mini-info border-b border-white/10 pb-6 mb-6">
              <EventImage
                src={event.imageUrl}
                alt={event.title}
                className="mini-image w-20 h-20 rounded-[16px] object-cover shadow-lg"
                iconSize={24}
              />
              <div>
                <h3 className="text-xl font-bold text-white mb-1">
                  {event.title}
                </h3>
                <div className="text-sm text-secondary flex items-center gap-1">
                  <Calendar size={14} /> {event.date}
                </div>
              </div>
            </div>

            <div className="order-summary mt-6 bg-black/40 rounded-[16px] p-6 border border-white/5">
              <h4 className="mb-4 text-white font-bold tracking-wide uppercase text-sm">
                Order Summary
              </h4>
              <div className="flex flex-col gap-3">
                {participants.map((p, idx) => {
                  const cat = event.categories.find(
                    (c: any) => c.id === p.categoryId,
                  );
                  return (
                    <div
                      key={p.id}
                      className="flex justify-between items-center text-sm"
                    >
                      <span className="text-secondary">
                        Runner {idx + 1}{" "}
                        {cat ? (
                          <span className="text-white">({cat.name})</span>
                        ) : (
                          ""
                        )}
                      </span>
                      <span className="font-bold text-white">
                        ₱{cat ? formatPesos(cat.price) : "0.00"}
                      </span>
                    </div>
                  );
                })}

                {sizeUpcharge > 0 && (
                  <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-white/5">
                    <span className="text-secondary">
                      Large size surcharge (4XL+)
                    </span>
                    <span className="text-white">
                      ₱{formatPesos(sizeUpcharge)}
                    </span>
                  </div>
                )}

                {logisticsMethod === "delivery" && (
                  <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-white/5">
                    <span className="text-secondary">
                      Delivery Fee
                      {selectedTier ? ` (${selectedTier.label})` : ""}
                    </span>
                    <span className="text-white">
                      ₱{formatPesos(deliveryFee)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-white/5">
                  <span className="text-secondary">Platform Fee</span>
                  <span className="text-white">
                    ₱{formatPesos(platformFee)}
                  </span>
                </div>

                {step === 3 && paymentMethod !== "bank_transfer" && (
                  <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-white/5">
                    <span className="text-secondary">Transaction Fee</span>
                    <span className="text-white">
                      ₱{formatPesos(transactionFee)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/10">
                <strong className="text-white uppercase tracking-wider text-sm">
                  Total
                </strong>
                <strong className="text-accent-orange text-2xl font-bold">
                  ₱{formatPesos(totalAmount)}
                </strong>
              </div>
            </div>

            {/* Step Progress Indicators */}
            <div className="steps-indicator mt-10 relative flex justify-between items-center">
              {/* Background Line */}
              <div className="absolute top-1/2 left-0 w-full h-[3px] bg-white/10 -translate-y-1/2 z-0 rounded-full"></div>

              {/* Active Progress Line */}
              <div
                className="absolute top-1/2 left-0 h-[3px] bg-accent-orange -translate-y-1/2 z-0 transition-all duration-700 ease-in-out rounded-full shadow-[0_0_12px_rgba(255,107,43,0.8)]"
                style={{
                  width: `${((step - 1) / (paymentMethod === "bank_transfer" || step === 4 ? 3 : 2)) * 100}%`,
                }}
              ></div>

              {[1, 2, 3, 4].map((s) => {
                const totalStepsShown =
                  paymentMethod === "bank_transfer" || step === 4 ? 4 : 3;
                if (s === 4 && totalStepsShown === 3) return null;

                const isActive = step === s;
                const isPast = step > s;

                return (
                  <div
                    key={s}
                    className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center font-bold text-base transition-all duration-500 ease-out ${
                      isActive
                        ? "bg-accent-orange text-white border-4 border-[#121212] shadow-[0_0_0_2px_rgba(255,107,43,1),_0_0_20px_rgba(255,107,43,0.6)] scale-110"
                        : isPast
                          ? "bg-accent-orange text-white border-4 border-[#121212] shadow-[0_0_0_2px_rgba(255,107,43,1)]"
                          : "bg-[#1a1a1a] border-2 border-white/20 text-white/40"
                    }`}
                  >
                    {isPast ? (
                      <CheckCircle2
                        size={20}
                        className="animate-in zoom-in duration-300"
                      />
                    ) : (
                      <span
                        className={
                          isActive ? "animate-in zoom-in duration-300" : ""
                        }
                      >
                        {s}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main Wizard Form */}
        <section className="wizard-content t-stagger-line t-stagger-line--2">
          <div className="glass-panel p-8 form-panel border border-white/10 bg-gradient-to-b from-white/5 to-transparent rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent-orange/5 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none"></div>

            {/* Header / Back button */}
            <div className="flex items-center gap-4 mb-8 pb-6 border-b border-white/10 relative z-10">
              {step > 1 && (
                <button
                  className="flex items-center gap-2 text-secondary hover:text-white transition-colors"
                  onClick={handleBack}
                >
                  <ArrowLeft size={20} />{" "}
                  <span className="font-bold">Back</span>
                </button>
              )}
              <h2 className="text-3xl font-bold text-white tracking-tight m-0">
                {step === 1 &&
                  (sellsPackages(event)
                    ? "Runner Details & Packages"
                    : "Runner Details & Categories")}
                {step === 2 && "Logistics"}
                {step === 3 && "Checkout & Payment"}
                {step === 4 && "Upload Proof of Payment"}
              </h2>
            </div>

            {/* STEP 1: Categories & Details */}
            {step === 1 && (
              <div className="step-content relative z-10 animate-fade-in">
                <p className="text-secondary text-lg mb-8">
                  {sellsPackages(event)
                    ? "Select a registration package and fill out the details for each runner. You can add multiple runners in one transaction."
                    : "Select a distance category and fill out the details for each runner. You can add multiple runners in one transaction."}
                </p>

                {participants.map((p, idx) => (
                  <div
                    key={p.id}
                    className="participant-form-block mb-10 p-6 rounded-[16px] bg-black/20 border border-white/5 relative"
                  >
                    <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="bg-white/10 w-8 h-8 rounded-full flex items-center justify-center text-sm">
                          {idx + 1}
                        </span>
                        Runner Details
                      </h3>
                      {idx > 0 && (
                        <button
                          className="text-red-500 hover:text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors text-sm font-bold"
                          onClick={() => removeParticipant(idx)}
                        >
                          <Trash2 size={16} /> Remove
                        </button>
                      )}
                    </div>

                    <CategoryPicker
                      id={runnerFieldId(idx, "categoryId")}
                      error={errorFor(idx, "categoryId")}
                      event={event}
                      selectedId={p.categoryId}
                      onSelect={categoryId =>
                        handleCategoryChange(idx, categoryId)
                      }
                    />

                    <h4 className="mb-3 text-secondary">
                      Personal Information
                    </h4>
                    <div className="form-grid">
                      <div className="input-group">
                        <label htmlFor={runnerFieldId(idx, "firstName")}>
                          First Name
                        </label>
                        <input
                          {...fieldAria(idx, "firstName")}
                          type="text"
                          value={p.firstName}
                          onChange={(e) =>
                            handleParticipantChange(
                              idx,
                              "firstName",
                              e.target.value,
                            )
                          }
                          placeholder="Juan"
                        />
                        <FieldError
                          id={`${runnerFieldId(idx, "firstName")}-error`}
                          message={errorFor(idx, "firstName")}
                        />
                      </div>
                      <div className="input-group">
                        <label htmlFor={runnerFieldId(idx, "lastName")}>
                          Last Name
                        </label>
                        <input
                          {...fieldAria(idx, "lastName")}
                          type="text"
                          value={p.lastName}
                          onChange={(e) =>
                            handleParticipantChange(
                              idx,
                              "lastName",
                              e.target.value,
                            )
                          }
                          placeholder="Dela Cruz"
                        />
                        <FieldError
                          id={`${runnerFieldId(idx, "lastName")}-error`}
                          message={errorFor(idx, "lastName")}
                        />
                      </div>
                      <div className="input-group">
                        <label htmlFor={runnerFieldId(idx, "email")}>
                          Email Address
                        </label>
                        <input
                          {...fieldAria(idx, "email")}
                          type="email"
                          value={p.email}
                          onChange={(e) =>
                            handleParticipantChange(
                              idx,
                              "email",
                              e.target.value,
                            )
                          }
                          placeholder="juan@example.com"
                        />
                        <FieldError
                          id={`${runnerFieldId(idx, "email")}-error`}
                          message={errorFor(idx, "email")}
                        />
                      </div>
                      <PhoneField
                        label="Mobile Number"
                        id={runnerFieldId(idx, "phone")}
                        error={errorFor(idx, "phone")}
                        value={p.phone}
                        defaultCountry={defaultCountry}
                        onChange={(e164) =>
                          handleParticipantChange(idx, "phone", e164)
                        }
                      />
                      <GenderField
                        id={runnerFieldId(idx, "gender")}
                        error={errorFor(idx, "gender")}
                        value={p.gender}
                        onChange={(gender) =>
                          handleParticipantChange(idx, "gender", gender)
                        }
                      />
                      <div className="input-group">
                        <label htmlFor={runnerFieldId(idx, "birthdate")}>
                          Birthdate
                        </label>
                        <input
                          {...fieldAria(idx, "birthdate")}
                          type="date"
                          value={p.birthdate}
                          onChange={(e) =>
                            handleParticipantChange(
                              idx,
                              "birthdate",
                              e.target.value,
                            )
                          }
                        />
                        <FieldError
                          id={`${runnerFieldId(idx, "birthdate")}-error`}
                          message={errorFor(idx, "birthdate")}
                        />
                      </div>
                      {categoryNeedsShirtSize(
                        findCategory(event.categories, p.categoryId),
                      ) && (
                        <ShirtSizeField
                          id={runnerFieldId(idx, "singletSize")}
                          error={errorFor(idx, "singletSize")}
                          value={p.singletSize}
                          upcharge={shirtSizeUpcharge}
                          onChange={(size) =>
                            handleParticipantChange(idx, "singletSize", size)
                          }
                          onOpenSizeGuide={() => setShowSizeGuideModal(true)}
                        />
                      )}

                      <CommunityPicker
                        value={p.runningCommunity}
                        options={communityOptions}
                        onChange={(name) =>
                          handleParticipantChange(
                            idx,
                            "runningCommunity",
                            name,
                          )
                        }
                        onAdd={rememberCommunity}
                      />
                    </div>

                    <h4 className="mt-6 mb-3 text-secondary">
                      Health & Emergency Info
                    </h4>
                    <div className="form-grid">
                      <div className="input-group">
                        <label
                          htmlFor={runnerFieldId(idx, "emergencyContactName")}
                        >
                          Emergency Contact Name
                        </label>
                        <input
                          {...fieldAria(idx, "emergencyContactName")}
                          type="text"
                          value={p.emergencyContactName}
                          onChange={(e) =>
                            handleParticipantChange(
                              idx,
                              "emergencyContactName",
                              e.target.value,
                            )
                          }
                          placeholder="Maria Dela Cruz"
                        />
                        <FieldError
                          id={`${runnerFieldId(idx, "emergencyContactName")}-error`}
                          message={errorFor(idx, "emergencyContactName")}
                        />
                      </div>
                      <PhoneField
                        label="Emergency Contact No."
                        id={runnerFieldId(idx, "emergencyContactPhone")}
                        error={errorFor(idx, "emergencyContactPhone")}
                        value={p.emergencyContactPhone}
                        defaultCountry={defaultCountry}
                        onChange={(e164) =>
                          handleParticipantChange(
                            idx,
                            "emergencyContactPhone",
                            e164,
                          )
                        }
                      />
                      <div className="input-group full-width">
                        <label>Medical Conditions (Optional)</label>
                        <textarea
                          value={p.medicalConditions}
                          onChange={(e) =>
                            handleParticipantChange(
                              idx,
                              "medicalConditions",
                              e.target.value,
                            )
                          }
                          placeholder="e.g. Asthma, Allergies (Leave blank if none)"
                        ></textarea>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  className="w-full mt-4 flex items-center justify-center gap-2 border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/30 text-white font-bold py-4 rounded-[16px] transition-all"
                  onClick={addParticipant}
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
                <p className="text-secondary mb-6">
                  How would you like to receive your race kits?
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  {event.logisticsPickup && (
                    <div
                      className={`group relative overflow-hidden border rounded-[16px] p-6 cursor-pointer transition-all ${
                        logisticsMethod === "pickup"
                          ? "border-accent-blue bg-accent-blue/10 shadow-[0_0_20px_rgba(0,122,255,0.15)]"
                          : "border-white/10 bg-black/40 hover:border-white/30 hover:bg-white/5"
                      }`}
                      onClick={() => setLogisticsMethod("pickup")}
                    >
                      <div
                        className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 transition-colors ${logisticsMethod === "pickup" ? "bg-accent-blue/20" : "bg-white/5 group-hover:bg-white/10"}`}
                      ></div>
                      <div className="relative z-10 flex justify-between items-start mb-3">
                        <div className="font-bold text-xl text-white">
                          On-site Pickup
                        </div>
                        {logisticsMethod === "pickup" && (
                          <CheckCircle2
                            size={24}
                            className="text-accent-blue"
                          />
                        )}
                      </div>
                      <div className="relative z-10 text-sm text-secondary mb-4 line-clamp-2">
                        Pick up your race kit at designated partner stores 3
                        days before the event.
                      </div>
                      <div className="relative z-10 font-bold text-accent-blue">
                        FREE
                      </div>
                    </div>
                  )}

                  {offersDelivery(event) && (
                    <div
                      className={`group relative overflow-hidden border rounded-[16px] p-6 cursor-pointer transition-all ${
                        logisticsMethod === "delivery"
                          ? "border-accent-blue bg-accent-blue/10 shadow-[0_0_20px_rgba(0,122,255,0.15)]"
                          : "border-white/10 bg-black/40 hover:border-white/30 hover:bg-white/5"
                      }`}
                      onClick={() => setLogisticsMethod("delivery")}
                    >
                      <div
                        className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 transition-colors ${logisticsMethod === "delivery" ? "bg-accent-blue/20" : "bg-white/5 group-hover:bg-white/10"}`}
                      ></div>
                      <div className="relative z-10 flex justify-between items-start mb-3">
                        <div className="font-bold text-xl text-white">
                          Door-to-Door Delivery
                        </div>
                        {logisticsMethod === "delivery" && (
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
                        {availableTiers.length > 1
                          ? `+₱${formatPesos(
                              Math.min(...availableTiers.map((t) => t.fee)),
                            )} onwards`
                          : `+₱${formatPesos(availableTiers[0].fee)}`}
                      </div>
                    </div>
                  )}
                </div>

                {logisticsMethod === "delivery" && (
                  <div className="animate-fade-in flex flex-col gap-6">
                    {/* Only worth asking when there is an actual choice. With a
                        single tier the zone is already selected for them. */}
                    {availableTiers.length > 1 && (
                      <div className="input-group full-width">
                        <label>Delivery Area</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                          {availableTiers.map((tier) => (
                            <div
                              key={tier.zone}
                              className={`border rounded-[16px] p-5 cursor-pointer transition-all flex justify-between items-center gap-4 ${
                                deliveryZone === tier.zone
                                  ? "border-accent-blue bg-accent-blue/10"
                                  : "border-white/10 bg-black/40 hover:border-white/30 hover:bg-white/5"
                              }`}
                              onClick={() => setDeliveryZone(tier.zone)}
                            >
                              <div className="flex items-center gap-3">
                                {deliveryZone === tier.zone && (
                                  <CheckCircle2
                                    size={20}
                                    className="text-accent-blue shrink-0"
                                  />
                                )}
                                <span className="font-medium text-white">
                                  {tier.label}
                                </span>
                              </div>
                              <span className="font-bold text-accent-blue whitespace-nowrap">
                                +₱{formatPesos(tier.fee)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-secondary mt-3">
                          Relative to {event.location}. Choose Outside Province
                          if your address is in a different province.
                        </p>
                      </div>
                    )}

                    <div className="input-group full-width">
                      <label htmlFor="delivery-address">
                        Complete Delivery Address
                      </label>
                      <textarea
                        id="delivery-address"
                        aria-invalid={deliveryAddressError ? true : undefined}
                        aria-describedby={
                          deliveryAddressError
                            ? "delivery-address-error"
                            : undefined
                        }
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="House/Unit No., Street, Barangay, City/Municipality, Province, Zip Code"
                        rows={4}
                      ></textarea>
                      <FieldError
                        id="delivery-address-error"
                        message={deliveryAddressError}
                      />
                    </div>
                  </div>
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
                <p className="text-secondary text-lg mb-8">
                  Choose how you want to pay for your registration.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  <div
                    className={`group relative overflow-hidden border ${paymentMethod === "gcash" ? "border-[#007DFE] bg-[#007DFE]/10" : "border-white/10 bg-black/40 hover:border-[#007DFE]/50"} rounded-[16px] p-6 cursor-pointer transition-all flex items-center gap-4`}
                    onClick={() => setPaymentMethod("gcash")}
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#007DFE]/10 rounded-full blur-xl -mr-12 -mt-12 group-hover:bg-[#007DFE]/20"></div>
                    <div
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentMethod === "gcash" ? "border-[#007DFE]" : "border-white/20"}`}
                    >
                      {paymentMethod === "gcash" && (
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

                  <div
                    className={`group relative overflow-hidden border ${paymentMethod === "maya" ? "border-[#00A164] bg-[#00A164]/10" : "border-white/10 bg-black/40 hover:border-[#00A164]/50"} rounded-[16px] p-6 cursor-pointer transition-all flex items-center gap-4`}
                    onClick={() => setPaymentMethod("maya")}
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#00A164]/10 rounded-full blur-xl -mr-12 -mt-12 group-hover:bg-[#00A164]/20"></div>
                    <div
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentMethod === "maya" ? "border-[#00A164]" : "border-white/20"}`}
                    >
                      {paymentMethod === "maya" && (
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

                  <div
                    className={`group relative overflow-hidden border ${paymentMethod === "qrph" ? "border-accent-blue bg-accent-blue/10" : "border-white/10 bg-black/40 hover:border-accent-blue/50"} rounded-[16px] p-6 cursor-pointer transition-all flex items-center gap-4`}
                    onClick={() => setPaymentMethod("qrph")}
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-accent-blue/10 rounded-full blur-xl -mr-12 -mt-12 group-hover:bg-accent-blue/20"></div>
                    <div
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentMethod === "qrph" ? "border-accent-blue" : "border-white/20"}`}
                    >
                      {paymentMethod === "qrph" && (
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

                  <div
                    className={`group relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-[16px] border ${
                      paymentMethod === "card"
                        ? "border-accent-blue bg-accent-blue/10"
                        : "border-white/10 bg-black/40 hover:border-accent-blue/50"
                    } p-6 transition-all`}
                    onClick={() => setPaymentMethod("card")}
                  >
                    <div className="absolute right-0 top-0 -mr-12 -mt-12 h-24 w-24 rounded-full bg-accent-blue/10 blur-xl group-hover:bg-accent-blue/20"></div>
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                        paymentMethod === "card"
                          ? "border-accent-blue"
                          : "border-white/20"
                      }`}
                    >
                      {paymentMethod === "card" && (
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

                  {/* Offered only when the organizer has given somewhere to
                      send the money. Without an account this option would take
                      the runner to a step that cannot be completed. */}
                  {bankAccounts.length > 0 && (
                  <div
                    className={`group relative overflow-hidden border ${paymentMethod === "bank_transfer" ? "border-accent-orange bg-accent-orange/10" : "border-white/10 bg-black/40 hover:border-accent-orange/50"} rounded-[16px] p-6 cursor-pointer transition-all flex items-center gap-4`}
                    onClick={() => setPaymentMethod("bank_transfer")}
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-accent-orange/10 rounded-full blur-xl -mr-12 -mt-12 group-hover:bg-accent-orange/20"></div>
                    <div
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentMethod === "bank_transfer" ? "border-accent-orange" : "border-white/20"}`}
                    >
                      {paymentMethod === "bank_transfer" && (
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

                <div className="checkout-total-box bg-accent-orange/10 border border-accent-orange/20 rounded-3xl mb-8 text-center py-10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-accent-orange/20 rounded-full blur-[80px] -mr-32 -mt-32"></div>
                  <div className="relative z-10 text-secondary mb-2 uppercase tracking-widest text-sm font-bold">
                    Total Amount to Pay
                  </div>
                  <div className="relative z-10 text-5xl font-extrabold text-white">
                    ₱{formatPesos(totalAmount)}
                  </div>
                </div>

                <ConsentWaiver
                  paragraphs={consentWaiverParagraphs}
                  checked={consentGiven}
                  onChange={setConsentGiven}
                />

                <div className="form-actions mt-10 flex justify-end">
                  <button
                    className={`btn-gradient flex items-center justify-center gap-2 px-10 py-4 text-lg group shadow-xl shadow-accent-orange/20 ${isProcessing || !consentGiven ? "opacity-50 pointer-events-none" : ""}`}
                    onClick={handleCheckout}
                    disabled={isProcessing || !consentGiven}
                  >
                    {isProcessing
                      ? paymentMethod !== "bank_transfer"
                        ? "Connecting to PayMongo..."
                        : "Processing..."
                      : paymentMethod !== "bank_transfer"
                        ? `Pay ₱${formatPesos(totalAmount)}`
                        : "Upload Deposit Slip"}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Bank Transfer Upload */}
            {step === 4 && (
              <div className="step-content relative z-10 animate-fade-in">
                <p className="text-secondary text-lg mb-8 leading-relaxed">
                  You have selected Manual Bank Transfer. Please choose a bank
                  below to view our account details and transfer{" "}
                  <strong className="text-white font-bold tracking-wide">
                    ₱{formatPesos(totalAmount)}
                  </strong>
                  . After payment, upload your deposit slip.
                </p>

                <h4 className="mb-4 text-accent-blue font-bold tracking-wide">
                  Select a Bank for Transfer
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                  {bankAccounts.map((bank) => (
                    <div
                      key={bank.id}
                      className="group relative overflow-hidden border border-white/10 bg-black/40 hover:border-accent-blue hover:bg-white/5 rounded-[16px] p-6 cursor-pointer transition-all text-center"
                      onClick={() => setSelectedBankModal(bank)}
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-accent-blue/10 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-accent-blue/20 transition-colors"></div>
                      <div className="relative z-10 font-bold text-xl text-white mb-1">
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
                  className={`relative overflow-hidden border-2 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer ${isDragging ? "border-accent-blue bg-accent-blue/10" : "border-white/20 bg-black/20 hover:border-white/40 hover:bg-white/5"}`}
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
                      setProofFile(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg, application/pdf"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    onChange={handleFileChange}
                    id="proof-upload"
                  />
                  <div className="flex flex-col items-center gap-2 text-center relative z-10">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-2 border border-white/10">
                      <UploadCloud size={36} className="text-accent-blue" />
                    </div>
                    <div className="text-xl font-bold text-white">
                      Drag & Drop your receipt here
                    </div>
                    <div className="text-secondary mb-2">
                      or click to browse from your device
                    </div>
                    <div className="text-xs text-secondary/50 mt-2 bg-black/40 px-4 py-2 rounded-full border border-white/5">
                      Supports JPG, PNG, PDF (Max 5MB)
                    </div>
                  </div>
                </div>

                {proofFile && (
                  <div className="file-preview animate-fade-in p-4 bg-white/5 border border-white/10 rounded-[16px] mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileImage size={24} className="text-accent-blue" />
                      <div>
                        <div className="font-bold text-white text-sm">
                          {proofFile.name}
                        </div>
                        <div className="text-xs text-secondary">
                          {(proofFile.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                    </div>
                    <button
                      className="text-secondary hover:text-red-400 bg-black/40 hover:bg-red-500/10 p-2 rounded-full transition-all"
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

                <div className="form-actions mt-10 flex justify-end">
                  <button
                    className={`btn-gradient flex items-center justify-center gap-2 px-10 py-4 text-lg group shadow-xl shadow-accent-orange/20 ${isProcessing || !proofFile || !transactionNumber.trim() ? "opacity-50 pointer-events-none" : ""}`}
                    onClick={handleManualSubmit}
                    disabled={
                      isProcessing || !proofFile || !transactionNumber.trim()
                    }
                  >
                    {isProcessing
                      ? "Submitting Registration..."
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
          onClose={() => setShowSizeGuideModal(false)}
        />
      )}
    </div>
  );
}
