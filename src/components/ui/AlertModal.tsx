"use client";

import React, { useId } from "react";
import { AlertCircle, CheckCircle, Info } from "lucide-react";

export type AlertVariant = "error" | "success" | "danger" | "info";

/**
 * The look of every alert in the app, in one place.
 *
 * The markup here is the admin error/success dialog that was copy-pasted into
 * four pages — same #111 panel, same tinted icon badge, same footer split off
 * by a hairline. The variant only swaps colour, icon, and the default wording,
 * so a success in the registration wizard and a success in the admin panel are
 * recognisably the same object.
 *
 * Animation rides on .t-modal in globals.css, which already honours
 * prefers-reduced-motion. This component only toggles is-open / is-closing.
 */
const VARIANTS: Record<
  AlertVariant,
  {
    Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
    panel: string;
    badge: string;
    confirmBtn: string;
    title: string;
    confirmLabel: string;
  }
> = {
  error: {
    Icon: AlertCircle,
    panel: "border-red-500/20",
    badge: "bg-red-500/10 text-red-500",
    confirmBtn:
      "bg-white/5 hover:bg-white/10 border border-white/10 text-white",
    title: "Action Failed",
    confirmLabel: "Acknowledge",
  },
  danger: {
    Icon: AlertCircle,
    panel: "border-red-500/20",
    badge: "bg-red-500/10 text-red-500",
    confirmBtn: "bg-red-500 hover:bg-red-600 text-white",
    title: "Are you sure?",
    confirmLabel: "Confirm",
  },
  success: {
    Icon: CheckCircle,
    panel: "border-green-500/20",
    badge: "bg-green-500/10 text-green-500",
    confirmBtn: "bg-green-500 hover:bg-green-600 text-white",
    title: "Success",
    confirmLabel: "Continue",
  },
  info: {
    Icon: Info,
    panel: "border-accent-blue/20",
    badge: "bg-accent-blue/10 text-accent-blue",
    confirmBtn:
      "bg-white/5 hover:bg-white/10 border border-white/10 text-white",
    title: "Heads up",
    confirmLabel: "Got it",
  },
};

export default function AlertModal({
  open,
  closing,
  variant = "error",
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  showCancel = false,
  onConfirm,
  onCancel,
}: {
  /** Drives the scale-in. Set one frame after mount so the transition runs. */
  open: boolean;
  closing: boolean;
  variant?: AlertVariant;
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  showCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const v = VARIANTS[variant];
  const titleId = useId();
  const bodyId = useId();

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
        open && !closing ? "opacity-100" : "opacity-0"
      }`}
      /* Above .modal-overlay (9999/10000) so an alert raised from inside the
         size guide or a bank-details modal is not painted underneath it. */
      style={{ zIndex: 10050 }}
      onClick={onCancel}
    >
      <div
        className={`t-modal w-full max-w-md bg-[#111] border ${v.panel} rounded-2xl shadow-2xl p-6 flex flex-col gap-6 ${
          open ? "is-open" : ""
        } ${closing ? "is-closing" : ""}`}
        role={showCancel ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className={`p-3 ${v.badge} rounded-full shrink-0 mt-1`}>
            <v.Icon size={24} strokeWidth={2} />
          </div>
          <div className="flex flex-col gap-2">
            <h3 id={titleId} className="text-xl font-semibold text-white">
              {title ?? v.title}
            </h3>
            {/* A div, not a p: a message may be a list of what is missing,
                and a <ul> inside a <p> is invalid markup the browser silently
                unnests, which breaks the styling. */}
            <div id={bodyId} className="text-gray-400 text-sm leading-relaxed">
              {message}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
          {showCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${v.confirmBtn}`}
          >
            {confirmLabel ?? v.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
