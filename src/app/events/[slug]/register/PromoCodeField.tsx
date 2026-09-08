"use client";

import React, { useId, useState } from "react";
import { Check, Info, Tag, X } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import {
  AppliedDiscount,
  MAX_PROMO_CODE_LENGTH,
  PromoTerms,
  normalizePromoCode,
  unknownPromoCodeError,
} from "@/lib/discount";

/** When the check itself failed, rather than the code being wrong. */
const LOOKUP_FAILED =
  "We couldn't check that code just now. Try again, or continue without it — you can still complete your registration.";

/**
 * The promo code box, shared by both wizards.
 *
 * It owns only the typing and the lookup. What a code is *worth* is the
 * parent's, because the order it applies to keeps changing under the runner —
 * they add a fourth runner, they switch from delivery to pickup — and the
 * summary, the total and the amount posted at checkout all have to move with
 * it. So the parent holds the applied code, recomputes with `applyPromo` on
 * every render, and hands this component back the result and any reason the
 * code has stopped qualifying.
 *
 * The code is uppercased as it is typed, like every other stored value in this
 * app (lib/text-case.ts), so what the runner sees in the box is what will be
 * compared and what will be printed on their receipt.
 */
export default function PromoCodeField({
  eventId,
  promo,
  applied,
  problem,
  note,
  onApply,
  onRemove,
}: {
  eventId: string;
  /** The code currently applied, or null. */
  promo: PromoTerms | null;
  /** What that code is worth on the order as it stands, or null. */
  applied: AppliedDiscount | null;
  /** Why the applied code does not currently qualify, from `promoCodeError`. */
  problem: string | null;
  /**
   * Something true about a code that is not wrong with it — today, that it
   * lost to a bigger automatic promotion. Kept apart from `problem` so it can
   * be said in a neutral voice rather than in the red one reserved for a field
   * that needs fixing.
   */
  note?: string | null;
  onApply: (promo: PromoTerms) => void;
  onRemove: () => void;
}) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  // Only the "we don't have that code" case lives here. Every other reason a
  // code cannot be used depends on the order, so it arrives as `problem`.
  const [notFound, setNotFound] = useState<string | null>(null);

  const baseId = useId();
  const inputId = `${baseId}-promo`;
  const errorId = `${inputId}-error`;

  const message = problem ?? notFound;

  const check = async () => {
    const cleaned = normalizePromoCode(code);
    if (!cleaned || checking) return;

    setChecking(true);
    setNotFound(null);
    try {
      const res = await fetch("/api/promos/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, code: cleaned }),
      });
      // A failed request is not the same answer as "no such code", and saying
      // it is would send the runner off hunting a typo that isn't there.
      if (!res.ok) {
        setNotFound(LOOKUP_FAILED);
        return;
      }
      const data = await res.json();
      if (data?.promo) {
        onApply(data.promo as PromoTerms);
        setCode("");
      } else {
        setNotFound(unknownPromoCodeError(cleaned));
      }
    } catch {
      // A code is the one field on this page the runner can simply do without,
      // so a failure says so rather than blocking the checkout.
      setNotFound(LOOKUP_FAILED);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="input-group full-width mb-6">
      <label htmlFor={inputId}>Promo Code (optional)</label>

      {promo ? (
        <div
          className={`flex items-center gap-3 rounded-[8px] border px-4 py-3 min-h-[48px] ${
            applied
              ? "border-emerald-400/40 bg-emerald-400/10"
              : "border-white/10 bg-black/30"
          }`}
        >
          {applied ? (
            <Check size={16} className="shrink-0 text-emerald-400" aria-hidden="true" />
          ) : (
            <Tag size={16} className="shrink-0 text-secondary" aria-hidden="true" />
          )}
          <span className="flex-1 min-w-0 truncate text-sm">
            <strong className="font-bold text-white">{promo.code}</strong>
            {applied ? (
              <span className="text-emerald-300"> — {applied.label}</span>
            ) : (
              <span className="text-secondary"> — not applied</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              onRemove();
              setNotFound(null);
            }}
            aria-label={`Remove promo code ${promo.code}`}
            className="shrink-0 text-secondary hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            id={inputId}
            type="text"
            value={code}
            maxLength={MAX_PROMO_CODE_LENGTH}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? errorId : undefined}
            placeholder="EARLYBIRD20"
            onChange={(e) => {
              setCode(normalizePromoCode(e.target.value));
              setNotFound(null);
            }}
            // Enter inside a wizard step would otherwise submit the step rather
            // than check the code the runner is plainly trying to check.
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                check();
              }
            }}
          />
          <button
            type="button"
            onClick={check}
            disabled={checking || !normalizePromoCode(code)}
            className="shrink-0 rounded-[8px] border border-white/15 bg-white/5 px-5 min-h-[48px] font-bold text-sm text-white transition-colors hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none"
          >
            {checking ? "Checking" : "Apply"}
          </button>
        </div>
      )}

      <FieldError id={errorId} message={message ?? undefined} />

      {/* Not a FieldError: nothing here needs fixing. The code is fine, it
          simply lost to a larger promotion, and colouring that red would send
          the runner looking for a mistake that is not there. */}
      {note && !message && (
        <p className="flex items-start gap-1.5 text-xs text-secondary">
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {note}
        </p>
      )}
    </div>
  );
}
