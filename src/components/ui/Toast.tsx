"use client";

import React from "react";
import { X } from "lucide-react";
import { ALERT_VARIANTS, type AlertVariant } from "./AlertModal";

/**
 * The look of a toast: an alert that does not need answering.
 *
 * A dialog stops the organizer and asks for a click, which is right when
 * something failed and wrong when something merely worked — pausing a
 * promotion or generating a batch used to refresh the table silently, and a
 * screen that changes with no word for it reads as a click that missed. This
 * says what happened and leaves.
 *
 * It wears the same variant table as `AlertModal`, so a success here and a
 * success in a dialog are the same green check in the same tinted badge.
 * Animation rides on `.t-toast` in globals.css, which already honours
 * prefers-reduced-motion; this component only toggles is-open.
 */
export default function Toast({
  open,
  variant = "success",
  title,
  message,
  onDismiss,
}: {
  /** Drives the rise-in. Set one frame after mount so the transition runs. */
  open: boolean;
  variant?: AlertVariant;
  title?: string;
  message: React.ReactNode;
  onDismiss: () => void;
}) {
  const v = ALERT_VARIANTS[variant];

  return (
    <div
      className={`t-toast pointer-events-auto w-full sm:w-[22rem] bg-[#111] border ${v.panel} rounded-xl shadow-2xl p-4 flex items-start gap-3 ${
        open ? "is-open" : ""
      }`}
      /* A failure has to interrupt whatever the screen reader is reading; a
         "Promotion paused" can wait its turn. */
      role={variant === "error" || variant === "danger" ? "alert" : "status"}
    >
      <div className={`p-2 ${v.badge} rounded-full shrink-0`}>
        <v.Icon size={16} strokeWidth={2} />
      </div>

      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        {title && (
          <p className="text-sm font-semibold text-white m-0">{title}</p>
        )}
        <div className="text-sm text-gray-400 leading-relaxed">{message}</div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="text-gray-500 hover:text-white transition-colors bg-transparent border-none cursor-pointer p-0 shrink-0"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
