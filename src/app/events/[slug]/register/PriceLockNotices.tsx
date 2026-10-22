"use client";

import React, { useEffect, useRef } from "react";
import { AlertTriangle, Clock, RefreshCw, X } from "lucide-react";
import { formatPesos } from "@/lib/money";
import type { PriceChangedBody } from "@/lib/price-changed";
import type { PriceCountdown, PriceNotice } from "./usePriceLock";

/**
 * What a runner is told about the price lock (PROMO_PRICE_LOCK_PLAN.md,
 * Batch 3): the countdown under the promotion it is about, the notice when a
 * renewal moved the total, the checkout's refusal when a price changed
 * anyway, and the bank-transfer warning not to send money at the last minute.
 *
 * Every one of them says what changed in figures. The incident this answers
 * was a runner who sent ₱6,985 and was then asked for more with no word about
 * why; a notice that only said "prices changed" would be that again.
 */

/** "04:12" — minutes and seconds, the only scale a 45-minute lock needs. */
function clockText(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/**
 * The countdown line in the order summary. The ticking text is hidden from
 * screen readers; `announcement` is the one line they hear, set only at five
 * minutes and at the end (usePriceHold).
 */
export function PriceCountdownLine({
  countdown,
  announcement,
}: {
  countdown: PriceCountdown | null;
  announcement: string;
}) {
  return (
    <>
      {countdown && (
        <div
          aria-hidden="true"
          className={`mt-3 flex items-center gap-2 rounded-[12px] border px-3 py-2 text-xs transition-colors ${
            countdown.urgent
              ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
              : "border-white/10 bg-white/[0.03] text-secondary"
          }`}
        >
          <Clock size={14} className="shrink-0" />
          <span className="min-w-0">
            {countdown.held ? (
              <>
                <span className="text-white font-medium">{countdown.name}</span>{" "}
                price held for you{" "}
              </>
            ) : (
              <>
                <span className="text-white font-medium">{countdown.name}</span>{" "}
                ends in{" "}
              </>
            )}
            {/* The time never breaks from its dot: "· 04:12" alone on a line
                still reads as the clock. */}
            {/* The server renders this a second before the browser does. */}
            <span
              suppressHydrationWarning
              className={`whitespace-nowrap font-semibold tabular-nums ${countdown.urgent ? "text-amber-300" : "text-white"}`}
            >
              {countdown.held && "· "}
              {clockText(countdown.remainingMs)}
            </span>
          </span>
        </div>
      )}
      {/* Always mounted: a live region that appears with its text is one some
          screen readers never read, and the "has ended" line arrives exactly
          as the countdown above disappears. */}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}

/** A renewal moved the total. Kept until the runner dismisses it. */
export function RenewedPriceNotice({
  notice,
  onDismiss,
}: {
  notice: PriceNotice;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="mt-4 flex items-start gap-3 rounded-[16px] border border-amber-400/30 bg-amber-400/[0.07] p-4"
    >
      <RefreshCw size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-300" />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm font-bold text-white">Your price was updated</p>
        <p className="m-0 mt-1 text-xs leading-relaxed text-secondary">
          The time your price was held for ran out, so your total changed from{" "}
          <span className="whitespace-nowrap text-white">₱{formatPesos(notice.from)}</span> to{" "}
          <span className="whitespace-nowrap font-semibold text-white">₱{formatPesos(notice.to)}</span>.
          Your details are still here.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss price update"
        className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-secondary transition-colors hover:bg-white/5 hover:text-white"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The checkout refused the order because its total no longer matched
 * (a 409 `PRICE_CHANGED`). Replaces the bare alert: the form stays, and the
 * runner is shown the total the server worked out, when it sent one.
 */
export function PriceChangedNotice({
  change,
  shownTotal,
  bankTransfer,
}: {
  change: PriceChangedBody;
  /** The total this page showed when the order was sent. */
  shownTotal: number;
  /** A runner who pays by hand may already have sent the old amount. */
  bankTransfer: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Moved to, so a runner whose eyes are on the button sees why it did not go
  // through, and a screen reader starts from it.
  useEffect(() => {
    ref.current?.focus();
  }, [change]);

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="mt-8 flex items-start gap-3 rounded-[16px] border border-amber-400/30 bg-amber-400/[0.07] p-5 focus:outline-none"
    >
      <AlertTriangle size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-300" />
      <div className="min-w-0">
        <p className="m-0 font-bold text-white">The price changed</p>
        <p className="m-0 mt-1 text-sm leading-relaxed text-secondary">
          {change.total !== undefined ? (
            <>
              Your registration was not submitted. The total is now{" "}
              <span className="whitespace-nowrap font-semibold text-white">
                ₱{formatPesos(change.total)}
              </span>
              {/* Same figure, different fee lines: naming the old total
                  would read as "₱X, not ₱X". */}
              {change.total !== shownTotal && <>, not ₱{formatPesos(shownTotal)}</>}
              . Reload the page to see the new price before you submit again.
            </>
          ) : (
            change.error
          )}
        </p>
        {bankTransfer && (
          <p className="m-0 mt-2 text-sm leading-relaxed text-white">
            If you already sent ₱{formatPesos(shownTotal)}, don&apos;t send
            again — message the organizer before submitting.
          </p>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/5"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Reload page
        </button>
      </div>
    </div>
  );
}

/**
 * Beside the account details when the held price has under five minutes
 * left: money sent now may meet a renewed, higher total.
 */
export function WaitForFreshPrice() {
  return (
    <div
      role="status"
      className="mb-8 flex items-start gap-3 rounded-[16px] border border-amber-400/30 bg-amber-400/[0.07] p-5"
    >
      <Clock size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-300" />
      <div>
        <p className="m-0 font-bold text-white">
          Wait for a fresh price before you send payment
        </p>
        <p className="m-0 mt-1 text-sm leading-relaxed text-secondary">
          The price held for you ends in under five minutes. Send the amount
          shown once it has been renewed, so what you transfer matches your
          total.
        </p>
      </div>
    </div>
  );
}
