"use client";

import React from "react";
import { Check, ShieldCheck } from "lucide-react";
import { CONSENT_CHECKBOX_LABEL } from "@/lib/consent-waiver";

/**
 * The liability, media, and data-privacy waiver, with the checkbox that gates
 * submission.
 *
 * Shown once per registration — right before the step that actually submits —
 * not once per runner. The Google Form this is drawn from asks it the same
 * way: a single section at the end of the form, not repeated per participant.
 *
 * Both the waiver and the checkbox sit as plain content on the panel, with no
 * frames of their own. A runner ticking a box that says they read it should be
 * able to see all of it at once, and a second frame inside a panel that is
 * already a frame only adds a border without adding meaning.
 *
 * The tick itself is still a real input kept for the keyboard and screen
 * readers, hidden behind a custom box so it carries the app's accent instead of
 * the browser's default control.
 *
 * Wording comes from the event, so an organizer can replace it with their own
 * terms — see resolveConsentWaiver for the fallback.
 */
export default function ConsentWaiver({
  paragraphs,
  checked,
  onChange,
}: {
  /** One string per paragraph, already resolved for this event. */
  paragraphs: readonly string[];
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="mt-6 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck size={18} className="text-accent-blue shrink-0" />
        <h4 className="text-white font-bold m-0">
          Disclaimer, Consent &amp; Data Privacy Waiver
        </h4>
      </div>

      {paragraphs.map((paragraph, idx) => (
        <p
          key={idx}
          className={`text-secondary text-sm leading-relaxed m-0 ${
            idx > 0 ? "mt-4" : ""
          }`}
        >
          {paragraph}
        </p>
      ))}

      <label className="group mt-6 flex items-center gap-3 cursor-pointer w-fit">
        {/* A real checkbox, visually hidden — the custom box beside it carries
            the look, and `peer` wires the focus ring back to the input. */}
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          required
        />
        {/* 6px, not the theme's rounded-md: at 20px square that reads as a
            circle, and the wizard already uses circles for radio choices. */}
        <span
          aria-hidden="true"
          className={`shrink-0 w-5 h-5 rounded-[6px] border-2 flex items-center justify-center transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-accent-orange peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black ${
            checked
              ? "border-accent-orange bg-accent-orange"
              : "border-white/30 group-hover:border-white/50"
          }`}
        >
          {checked && <Check size={14} strokeWidth={3} className="text-black" />}
        </span>
        <span className="text-sm text-white leading-relaxed">
          {CONSENT_CHECKBOX_LABEL}{" "}
          <span className="text-accent-orange font-bold">*</span>
        </span>
      </label>
    </div>
  );
}
