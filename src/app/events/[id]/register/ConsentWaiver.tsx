"use client";

import React from "react";
import { ShieldCheck } from "lucide-react";
import { consentWaiverParagraphs, CONSENT_CHECKBOX_LABEL } from "@/lib/consent-waiver";

/**
 * The liability, media, and data-privacy waiver, with the checkbox that gates
 * submission.
 *
 * Shown once per registration — right before the step that actually submits —
 * not once per runner. The Google Form this is drawn from asks it the same
 * way: a single section at the end of the form, not repeated per participant.
 *
 * The full text sits in a fixed-height scroll box rather than the page itself,
 * so six paragraphs of legal wording do not blow out the length of what is
 * already the longest step in the wizard. Nothing is hidden behind a click —
 * a waiver a runner has to expand to read is not one they can fairly be said
 * to have agreed to.
 */
export default function ConsentWaiver({
  eventTitle,
  checked,
  onChange,
}: {
  eventTitle: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const paragraphs = consentWaiverParagraphs(eventTitle);

  return (
    <div className="mt-6 mb-8">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={18} className="text-accent-blue shrink-0" />
        <h4 className="text-white font-bold m-0">
          Disclaimer, Consent &amp; Data Privacy Waiver
        </h4>
      </div>

      <div className="max-h-48 overflow-y-auto rounded-[12px] border border-white/10 bg-black/30 p-4 space-y-3">
        {paragraphs.map((paragraph, idx) => (
          <p key={idx} className="text-secondary text-sm leading-relaxed m-0">
            {paragraph}
          </p>
        ))}
      </div>

      <label
        htmlFor="consent-waiver-checkbox"
        className="flex items-start gap-3 mt-3 p-2 -m-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
      >
        <input
          type="checkbox"
          id="consent-waiver-checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          required
          className="w-5 h-5 mt-0.5 shrink-0 accent-accent-blue"
        />
        <span className="text-sm text-primary leading-relaxed">
          {CONSENT_CHECKBOX_LABEL} <span className="text-red-500">*</span>
        </span>
      </label>
    </div>
  );
}
