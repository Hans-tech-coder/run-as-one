"use client";

import React, { useState } from "react";
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
  Info,
  Ruler,
  Calendar,
} from "lucide-react";
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
}

export default function RegistrationWizardClient({
  event,
  eventId,
  registration,
}: {
  event: any;
  eventId: string;
  registration?: any;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [selectedBankModal, setSelectedBankModal] = useState<any | null>(null);
  const [transactionNumber, setTransactionNumber] = useState("");
  const [showSizeGuideModal, setShowSizeGuideModal] = useState(false);

  const [adminFeePerRunner, setAdminFeePerRunner] = useState(60);

  React.useEffect(() => {
    if (isSuccessParam) {
      setOrderRef(`RM-${Math.floor(Math.random() * 1000000)}`);
    }

    const fetchAdminFee = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/fee`);
        if (res.ok) {
          const data = await res.json();
          setAdminFeePerRunner(data.adminFee);
        }
      } catch (err) {
        console.error("Failed to fetch admin fee", err);
      }
    };

    fetchAdminFee();
  }, [isSuccessParam, eventId]);

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

  const addParticipant = () => {
    setParticipants([
      ...participants,
      {
        id: Date.now(),
        categoryId: participants[0].categoryId || "",
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

  // Calculations
  const subtotal = participants.reduce((total, p) => {
    const cat = event.categories.find((c: any) => c.id === p.categoryId);
    return total + (cat ? cat.price : 0);
  }, 0);

  const deliveryFee =
    logisticsMethod === "delivery" ? event.logisticsDeliveryFee : 0;

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
      const fixed = 15; // ₱15
      transactionFee = (baseAmountForFee * rate + fixed) / (1 - rate);
    }

    // Round to 2 decimal places to avoid floating point issues, or round to nearest integer.
    // PayMongo accepts amounts in cents, so rounding to nearest integer is safer for whole pesos, but we can do Math.ceil to be safe and ensure the merchant doesn't lose out.
    transactionFee = Math.ceil(transactionFee);
  }

  const totalAmount = subtotal + deliveryFee + platformFee + transactionFee;

  // Validation checks
  const validateStep1 = () => {
    return participants.every(
      (p) =>
        p.categoryId &&
        p.firstName &&
        p.lastName &&
        p.email &&
        p.phone &&
        p.gender &&
        p.birthdate &&
        p.singletSize &&
        p.emergencyContactName &&
        p.emergencyContactPhone,
    );
  };

  const validateStep2 = () => {
    return (
      logisticsMethod === "pickup" ||
      (logisticsMethod === "delivery" && deliveryAddress.trim() !== "")
    );
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) {
      alert(
        "Please complete all required fields and select a category for all runners.",
      );
      return;
    }
    if (step === 2 && !validateStep2()) {
      alert("Please provide a complete delivery address.");
      return;
    }
    setStep((prev) => prev + 1);
  };

  const handleBack = () => setStep((prev) => prev - 1);

  const bankOptions = [
    {
      id: "bdo",
      name: "BDO Unibank",
      accountName: "Run As One Events",
      accountNumber: "0012 3456 7890",
      qrCode: "https://via.placeholder.com/200?text=BDO+QR+Code",
    },
    {
      id: "bpi",
      name: "BPI",
      accountName: "Run As One Events",
      accountNumber: "0987 6543 21",
      qrCode: "https://via.placeholder.com/200?text=BPI+QR+Code",
    },
    {
      id: "metrobank",
      name: "Metrobank",
      accountName: "Run As One Events",
      accountNumber: "1122 3344 55",
      qrCode: "https://via.placeholder.com/200?text=Metrobank+QR+Code",
    },
  ];

  const handleCheckout = async () => {
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
          successUrl: `${baseUrl}/events/${eventId}/register?success=true`,
          cancelUrl: `${baseUrl}/events/${eventId}/register`,
          customerEmail: participants[0].email,
          customerName: `${participants[0].firstName} ${participants[0].lastName}`,
          eventId: eventId,
          participants: participants,
          logisticsMethod: logisticsMethod,
          deliveryAddress: deliveryAddress,
          subtotal: subtotal,
          deliveryFee: deliveryFee,
          platformFee: platformFee,
          transactionFee: transactionFee,
          paymentMethod: paymentMethod,
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
      alert("Please upload your deposit slip or proof of payment.");
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
      formData.append("deliveryAddress", deliveryAddress || "");
      formData.append("subtotal", subtotal.toString());
      formData.append("deliveryFee", deliveryFee.toString());
      formData.append("platformFee", platformFee.toString());
      formData.append("transactionFee", transactionFee.toString());
      formData.append("totalAmount", totalAmount.toString());
      formData.append("paymentMethod", paymentMethod);
      formData.append("transactionNumber", transactionNumber);

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
          `/events/${eventId}/register?success=true&orderRef=${data.orderRef}`,
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

              <div className="w-full bg-black/40 border border-white/5 rounded-2xl p-6 mb-8 text-left">
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
                    ₱
                    {(
                      registration?.totalAmount || totalAmount
                    ).toLocaleString()}
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
              <img
                src={event.imageUrl}
                alt="Event"
                className="mini-image w-20 h-20 rounded-2xl object-cover shadow-lg"
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

            <div className="order-summary mt-6 bg-black/40 rounded-2xl p-6 border border-white/5">
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
                        ₱{cat ? cat.price.toLocaleString() : "0"}
                      </span>
                    </div>
                  );
                })}

                {logisticsMethod === "delivery" && (
                  <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-white/5">
                    <span className="text-secondary">Delivery Fee</span>
                    <span className="text-white">
                      ₱{deliveryFee.toLocaleString()}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-white/5">
                  <span className="text-secondary">Platform Fee</span>
                  <span className="text-white">
                    ₱{platformFee.toLocaleString()}
                  </span>
                </div>

                {step === 3 && paymentMethod !== "bank_transfer" && (
                  <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-white/5">
                    <span className="text-secondary">Transaction Fee</span>
                    <span className="text-white">
                      ₱{transactionFee.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/10">
                <strong className="text-white uppercase tracking-wider text-sm">
                  Total
                </strong>
                <strong className="text-accent-orange text-2xl font-bold">
                  ₱{totalAmount.toLocaleString()}
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
                {step === 1 && "Runner Details & Categories"}
                {step === 2 && "Logistics"}
                {step === 3 && "Checkout & Payment"}
                {step === 4 && "Upload Proof of Payment"}
              </h2>
            </div>

            {/* STEP 1: Categories & Details */}
            {step === 1 && (
              <div className="step-content relative z-10 animate-fade-in">
                <p className="text-secondary text-lg mb-8">
                  Select a distance category and fill out the details for each
                  runner. You can add multiple runners in one transaction.
                </p>

                {participants.map((p, idx) => (
                  <div
                    key={p.id}
                    className="participant-form-block mb-10 p-6 rounded-2xl bg-black/20 border border-white/5 relative"
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

                    <h4 className="mb-3 text-secondary text-sm font-bold uppercase tracking-wider">
                      Select Category
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                      {event.categories.map((cat: any) => (
                        <div
                          key={cat.id}
                          className={`group relative overflow-hidden border rounded-2xl p-5 cursor-pointer transition-all ${
                            p.categoryId === cat.id
                              ? "border-accent-orange bg-accent-orange/10 shadow-[0_0_20px_rgba(255,107,43,0.15)]"
                              : "border-white/10 bg-black/40 hover:border-white/30 hover:bg-white/5"
                          }`}
                          onClick={() =>
                            handleParticipantChange(idx, "categoryId", cat.id)
                          }
                        >
                          <div
                            className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 transition-colors ${p.categoryId === cat.id ? "bg-accent-orange/20" : "bg-white/5 group-hover:bg-white/10"}`}
                          ></div>
                          <div className="relative z-10 flex justify-between items-start mb-2">
                            <div className="font-bold text-lg text-white">
                              {cat.name}
                            </div>
                            {p.categoryId === cat.id && (
                              <CheckCircle2
                                size={20}
                                className="text-accent-orange"
                              />
                            )}
                          </div>
                          <div className="relative z-10 text-sm text-secondary bg-white/10 inline-block px-3 py-1 rounded-full mb-4">
                            {cat.distance}
                          </div>
                          <div className="relative z-10 text-xl font-bold text-accent-orange">
                            ₱{cat.price.toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>

                    <h4 className="mb-3 text-secondary">
                      Personal Information
                    </h4>
                    <div className="form-grid">
                      <div className="input-group">
                        <label>First Name</label>
                        <input
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
                      </div>
                      <div className="input-group">
                        <label>Last Name</label>
                        <input
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
                      </div>
                      <div className="input-group">
                        <label>Email Address</label>
                        <input
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
                      </div>
                      <div className="input-group">
                        <label>Mobile Number</label>
                        <input
                          type="tel"
                          value={p.phone}
                          onChange={(e) =>
                            handleParticipantChange(
                              idx,
                              "phone",
                              e.target.value,
                            )
                          }
                          placeholder="09xxxxxxxxx"
                        />
                      </div>
                      <div className="input-group">
                        <label>Gender</label>
                        <select
                          value={p.gender}
                          onChange={(e) =>
                            handleParticipantChange(
                              idx,
                              "gender",
                              e.target.value,
                            )
                          }
                        >
                          <option value="">Select Gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label>Birthdate</label>
                        <input
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
                      </div>
                      <div className="input-group">
                        <div className="flex justify-between items-center mb-1">
                          <label className="mb-0">Singlet Size</label>
                          <button
                            type="button"
                            style={{
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              minWidth: 0,
                            }}
                            className="text-xs text-accent-blue flex items-center hover:text-white transition-colors"
                            onClick={() => setShowSizeGuideModal(true)}
                          >
                            <Ruler size={14} style={{ marginRight: "4px" }} />{" "}
                            Size Guide
                          </button>
                        </div>
                        <select
                          value={p.singletSize}
                          onChange={(e) =>
                            handleParticipantChange(
                              idx,
                              "singletSize",
                              e.target.value,
                            )
                          }
                        >
                          <option value="">Select Size</option>
                          <option value="XS">XS</option>
                          <option value="S">S</option>
                          <option value="M">M</option>
                          <option value="L">L</option>
                          <option value="XL">XL</option>
                          <option value="XXL">XXL</option>
                        </select>
                      </div>
                    </div>

                    <h4 className="mt-6 mb-3 text-secondary">
                      Health & Emergency Info
                    </h4>
                    <div className="form-grid">
                      <div className="input-group">
                        <label>Emergency Contact Name</label>
                        <input
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
                      </div>
                      <div className="input-group">
                        <label>Emergency Contact No.</label>
                        <input
                          type="tel"
                          value={p.emergencyContactPhone}
                          onChange={(e) =>
                            handleParticipantChange(
                              idx,
                              "emergencyContactPhone",
                              e.target.value,
                            )
                          }
                          placeholder="09xxxxxxxxx"
                        />
                      </div>
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
                  className="w-full mt-4 flex items-center justify-center gap-2 border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/30 text-white font-bold py-4 rounded-2xl transition-all"
                  onClick={addParticipant}
                >
                  <Plus size={20} /> Add Another Runner
                </button>

                <div className="form-actions mt-10 flex justify-end">
                  <button
                    className="btn-gradient flex items-center justify-center gap-2 px-10 py-4 rounded-2xl text-lg group shadow-xl shadow-accent-orange/20"
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
                      className={`group relative overflow-hidden border rounded-2xl p-6 cursor-pointer transition-all ${
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

                  {event.logisticsDeliveryFee > 0 && (
                    <div
                      className={`group relative overflow-hidden border rounded-2xl p-6 cursor-pointer transition-all ${
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
                        +₱{event.logisticsDeliveryFee.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {logisticsMethod === "delivery" && (
                  <div className="input-group full-width mt-6 animate-fade-in">
                    <label>Complete Delivery Address</label>
                    <textarea
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="House/Unit No., Street, Barangay, City/Municipality, Province, Zip Code"
                      rows={4}
                    ></textarea>
                  </div>
                )}

                <div className="form-actions mt-10 flex justify-end animate-fade-in">
                  <button
                    className="btn-gradient flex items-center justify-center gap-2 px-10 py-4 rounded-2xl text-lg group shadow-xl shadow-accent-orange/20"
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
                    className={`group relative overflow-hidden border ${paymentMethod === "gcash" ? "border-[#007DFE] bg-[#007DFE]/10" : "border-white/10 bg-black/40 hover:border-[#007DFE]/50"} rounded-2xl p-6 cursor-pointer transition-all flex items-center gap-4`}
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
                    className={`group relative overflow-hidden border ${paymentMethod === "maya" ? "border-[#00A164] bg-[#00A164]/10" : "border-white/10 bg-black/40 hover:border-[#00A164]/50"} rounded-2xl p-6 cursor-pointer transition-all flex items-center gap-4`}
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
                    className={`group relative overflow-hidden border ${paymentMethod === "qrph" ? "border-accent-blue bg-accent-blue/10" : "border-white/10 bg-black/40 hover:border-accent-blue/50"} rounded-2xl p-6 cursor-pointer transition-all flex items-center gap-4`}
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
                    className={`group relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-2xl border ${
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

                  <div
                    className={`group relative overflow-hidden border ${paymentMethod === "bank_transfer" ? "border-accent-orange bg-accent-orange/10" : "border-white/10 bg-black/40 hover:border-accent-orange/50"} rounded-2xl p-6 cursor-pointer transition-all flex items-center gap-4`}
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
                </div>

                <div className="checkout-total-box bg-accent-orange/10 border border-accent-orange/20 rounded-3xl mb-8 text-center py-10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-accent-orange/20 rounded-full blur-[80px] -mr-32 -mt-32"></div>
                  <div className="relative z-10 text-secondary mb-2 uppercase tracking-widest text-sm font-bold">
                    Total Amount to Pay
                  </div>
                  <div className="relative z-10 text-5xl font-extrabold text-white">
                    ₱{totalAmount.toLocaleString()}
                  </div>
                </div>

                <div className="form-actions mt-10 flex justify-end">
                  <button
                    className={`btn-gradient flex items-center justify-center gap-2 px-10 py-4 text-lg group shadow-xl shadow-accent-orange/20 ${isProcessing ? "opacity-50 pointer-events-none" : ""}`}
                    onClick={handleCheckout}
                    disabled={isProcessing}
                  >
                    {isProcessing
                      ? paymentMethod !== "bank_transfer"
                        ? "Connecting to PayMongo..."
                        : "Processing..."
                      : paymentMethod !== "bank_transfer"
                        ? `Pay ₱${totalAmount.toLocaleString()}`
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
                    ₱{totalAmount.toLocaleString()}
                  </strong>
                  . After payment, upload your deposit slip.
                </p>

                <h4 className="mb-4 text-accent-blue font-bold tracking-wide">
                  Select a Bank for Transfer
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                  {bankOptions.map((bank) => (
                    <div
                      key={bank.id}
                      className="group relative overflow-hidden border border-white/10 bg-black/40 hover:border-accent-blue hover:bg-white/5 rounded-2xl p-6 cursor-pointer transition-all text-center"
                      onClick={() => setSelectedBankModal(bank)}
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-accent-blue/10 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-accent-blue/20 transition-colors"></div>
                      <div className="relative z-10 font-bold text-xl text-white mb-1">
                        {bank.name}
                      </div>
                      <div className="relative z-10 text-sm text-secondary">
                        Click to view details & QR
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
                  <div className="file-preview animate-fade-in p-4 bg-white/5 border border-white/10 rounded-2xl mt-4 flex items-center justify-between">
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
        <div
          className="modal-overlay"
          onClick={() => setSelectedBankModal(null)}
        >
          <div
            className="modal-content glass-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close-btn"
              onClick={() => setSelectedBankModal(null)}
            >
              <X size={24} />
            </button>
            <h3 className="text-xl mb-4">{selectedBankModal.name} Details</h3>

            <div className="bank-details-card mb-6">
              <div className="bank-detail-item">
                <span className="bank-detail-label">Account Name</span>
                <span className="bank-detail-value">
                  {selectedBankModal.accountName}
                </span>
              </div>
              <div className="bank-detail-item">
                <span className="bank-detail-label">Account Number</span>
                <span className="bank-detail-value">
                  {selectedBankModal.accountNumber}
                </span>
              </div>
            </div>

            <div className="qr-code-container mb-4">
              <div className="text-center text-sm text-secondary mb-2">
                Scan to Pay
              </div>
              <img
                src={selectedBankModal.qrCode}
                alt={`${selectedBankModal.name} QR Code`}
                className="qr-image mx-auto rounded-lg"
              />
            </div>

            <div className="text-center mt-6">
              <button
                className="btn-gradient w-full"
                onClick={() => setSelectedBankModal(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showSizeGuideModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowSizeGuideModal(false)}
        >
          <div
            className="modal-content glass-panel max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close-btn"
              onClick={() => setShowSizeGuideModal(false)}
            >
              <X size={24} />
            </button>
            <h3 className="text-xl mb-6 text-accent-blue flex items-center gap-2">
              <Info size={24} /> Size Guide
            </h3>

            <p className="text-secondary text-sm mb-4">
              Measurements are in inches (Width x Length). Please allow a ±0.5
              inch tolerance due to manual measurement. Standard Asian Fit.
            </p>

            <div className="overflow-x-auto mb-6">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="py-3 px-4 text-white font-medium">Size</th>
                    <th className="py-3 px-4 text-white font-medium">
                      Width (Chest)
                    </th>
                    <th className="py-3 px-4 text-white font-medium">Length</th>
                  </tr>
                </thead>
                <tbody className="text-secondary">
                  <tr className="border-b border-gray-800/50 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-medium text-white">XS</td>
                    <td className="py-3 px-4">18"</td>
                    <td className="py-3 px-4">25"</td>
                  </tr>
                  <tr className="border-b border-gray-800/50 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-medium text-white">S</td>
                    <td className="py-3 px-4">19"</td>
                    <td className="py-3 px-4">26"</td>
                  </tr>
                  <tr className="border-b border-gray-800/50 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-medium text-white">M</td>
                    <td className="py-3 px-4">20"</td>
                    <td className="py-3 px-4">27"</td>
                  </tr>
                  <tr className="border-b border-gray-800/50 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-medium text-white">L</td>
                    <td className="py-3 px-4">21"</td>
                    <td className="py-3 px-4">28"</td>
                  </tr>
                  <tr className="border-b border-gray-800/50 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-medium text-white">XL</td>
                    <td className="py-3 px-4">22"</td>
                    <td className="py-3 px-4">29"</td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-medium text-white">XXL</td>
                    <td className="py-3 px-4">23"</td>
                    <td className="py-3 px-4">30"</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-dark/50 border border-blue p-4 rounded-lg text-sm text-secondary">
              <span className="text-accent-blue font-medium block mb-1">
                Note:
              </span>
              Both the Race Singlet and Finisher Shirt follow this standard
              sizing guide.
            </div>

            <div className="text-center mt-6">
              <button
                className="btn-gradient w-full"
                onClick={() => setShowSizeGuideModal(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
