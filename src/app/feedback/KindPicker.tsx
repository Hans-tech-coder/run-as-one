"use client";

import React from "react";
import { AlertTriangle, Lightbulb, Sparkles } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import { FEEDBACK_KINDS, FEEDBACK_KIND_COPY, type FeedbackKind } from "@/lib/feedback";

/** The icon each kind wears. Lucide, in currentColor, like every other icon in
 *  the app — never an emoji. */
const KIND_ICON: Record<FeedbackKind, React.ReactNode> = {
  ISSUE: <AlertTriangle size={20} aria-hidden="true" />,
  SUGGESTION: <Lightbulb size={20} aria-hidden="true" />,
  FEATURE: <Sparkles size={20} aria-hidden="true" />,
};

/**
 * The feedback form's first question — what the message is about — as three
 * choice cards (`.site-choice`, site.css). Split out of `FeedbackForm`.
 *
 * Each card is a real radio, visually hidden — the same control the category
 * picker uses, so the arrow keys, the tab stop and what a screen reader
 * announces are the browser's job rather than ours. While the group is the
 * thing that is missing, the unchosen cards carry the red edge: a sentence
 * under a row of cards that look untouched is a validation message the eye
 * skips.
 */
export default function KindPicker({
  id,
  kind,
  error,
  onPick,
}: {
  id: string;
  kind: FeedbackKind | "";
  error?: string;
  onPick: (kind: FeedbackKind) => void;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-1 block p-0 text-[0.9375rem] font-semibold text-site-ink">
        What is this about?
      </legend>

      <div
        id={id}
        role="radiogroup"
        aria-label="What is this about?"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        tabIndex={-1}
        className="mt-3 grid grid-cols-1 gap-3 outline-none sm:grid-cols-3"
      >
        {FEEDBACK_KINDS.map((option) => {
          const isSelected = kind === option;
          const copy = FEEDBACK_KIND_COPY[option];
          return (
            <label
              key={option}
              className="site-choice"
              data-checked={isSelected}
              data-invalid={!isSelected && !!error}
            >
              <input
                type="radio"
                name="feedback-kind"
                className="sr-only"
                checked={isSelected}
                onChange={() => onPick(option)}
              />
              <span className="site-choice__icon">{KIND_ICON[option]}</span>
              <span className="site-choice__label">{copy.label}</span>
              <span className="site-choice__hint">{copy.blurb}</span>
            </label>
          );
        })}
      </div>

      <div className="mt-2">
        <FieldError id={`${id}-error`} message={error} />
      </div>
    </fieldset>
  );
}
