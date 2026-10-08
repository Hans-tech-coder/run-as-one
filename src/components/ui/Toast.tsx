"use client";

import React from "react";
import { X } from "lucide-react";
import { ALERT_VARIANTS, type AlertVariant } from "./AlertModal";
import RunnerLoader from "./RunnerLoader";

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
 *
 * `pending` is the same panel while the work is still running: the app's one
 * loader in place of the variant's icon, so a status change made from a row
 * menu is seen to be happening rather than looking like a click that missed.
 */
export default function Toast({
  open,
  variant = "success",
  title,
  message,
  pending = false,
  onDismiss,
}: {
  /** Drives the rise-in. Set one frame after mount so the transition runs. */
  open: boolean;
  variant?: AlertVariant;
  title?: string;
  message: React.ReactNode;
  /** Still working — shows the running figure until the caller settles it. */
  pending?: boolean;
  onDismiss: () => void;
}) {
  const v = ALERT_VARIANTS[pending ? "info" : variant];

  return (
    <div
      className={`t-toast pointer-events-auto w-full sm:w-[22rem] bg-[var(--dash-panel-solid)] border ${v.panel} rounded-xl shadow-2xl p-4 flex items-start gap-3 ${
        open ? "is-open" : ""
      }`}
      /* A failure has to interrupt whatever the screen reader is reading; a
         "Promotion paused" can wait its turn. */
      role={variant === "error" || variant === "danger" ? "alert" : "status"}
    >
      <div className={`p-2 ${v.badge} rounded-full shrink-0 flex`}>
        {pending ? (
          <RunnerLoader size="sm" tone="current" label="" />
        ) : (
          <v.Icon size={16} strokeWidth={2} />
        )}
      </div>

      {/* At least the badge's height and centred in it, so a one-line toast
          reads level with its icon instead of hugging the top edge; a longer
          message simply grows downwards from there. The dismiss button stays
          pinned top-right, where a close control is looked for. */}
      <div className="flex flex-col justify-center gap-0.5 min-w-0 flex-1 min-h-8">
        {title && (
          <p className="text-sm font-semibold text-primary m-0">{title}</p>
        )}
        <div className="text-sm text-secondary leading-relaxed">{message}</div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="text-[var(--text-muted)] hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0 shrink-0"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
