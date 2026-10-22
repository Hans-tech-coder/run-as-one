"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppliedDiscount, PromoTerms } from "@/lib/discount";
import { discountParts } from "@/lib/promo-winner";
import { PRICE_LOCK_GRACE_MINUTES, PRICE_LOCK_MINUTES } from "@/lib/price-lock-window";

/**
 * The price lock on the wizard's side (PROMO_PRICE_LOCK_PLAN.md, Batch 3).
 *
 * Two hooks, because they sit either side of the pricing: `usePriceLock` holds
 * the lock that `usePromoPricing` prices with, and `usePriceHold` reads the
 * discount that pricing produced to decide what the runner is shown.
 *
 * - **The lock is taken at the first keystroke, not on page load** (owner, D1).
 *   A runner who opens the page and leaves has started nothing, and a lock per
 *   page view would start every countdown before anyone is filling anything in.
 * - **A lock that cannot be had is no lock.** A failed or throttled request
 *   leaves the form priced at now, which is exactly how it worked before locks
 *   existed. Registration is never held up for one.
 * - **At its deadline the lock is renewed, not stretched** (R3): the new one
 *   is taken at the new moment, so a promotion that ended in between is gone.
 *   If that moves the total, the runner is told old → new; the form keeps
 *   every field.
 * - **The clock ticks only while a countdown is on screen** (D2). Otherwise one
 *   timer waits for the next moment a price can change, so an idle form costs
 *   nothing.
 */

const MINUTE_MS = 60_000;
const LOCK_MS = PRICE_LOCK_MINUTES * MINUTE_MS;

// How long past the deadline a lock is kept for a runner who has already
// picked a deposit slip: the server's grace, less a margin so the renewal
// lands while the old token is still honoured.
const SLIP_HOLD_MS = PRICE_LOCK_GRACE_MINUTES * MINUTE_MS - MINUTE_MS;

// After a lock could not be had, the next keystroke may ask again only after
// this, so a throttled form does not send a request per key.
const RETRY_AFTER_MS = MINUTE_MS;

/** Under this, the countdown turns amber and a bank transfer is told to wait. */
export const PRICE_HOLD_WARNING_MS = 5 * MINUTE_MS;

// setTimeout overflows past 2^31-1 ms (about 24 days) and fires at once, so a
// promotion ending next month is waited for a day at a time.
const LONGEST_WAIT_MS = 24 * 60 * MINUTE_MS;

interface HeldLock {
  token: string;
  /** Epoch ms: the moment whose promotions the lock keeps. */
  lockedAt: number;
  /** Epoch ms, server time: when the window the lock keeps ends. */
  expiresAt: number;
  /**
   * The same deadline on this device's clock: when the lock arrived plus its
   * length. What the countdown counts to and the renewal waits for, so a phone
   * whose clock is off does not renew in a loop or show a wrong countdown.
   */
  renewAt: number;
}

export interface PriceLockState {
  /** The signed token the checkout reads, or null without a lock. */
  token: string | null;
  lockedAt: number | null;
  expiresAt: number | null;
  /** The deadline on this device's clock (HeldLock.renewAt). */
  renewAt: number | null;
  /** Counts renewals, so a total that moved because of one can be told apart. */
  renewals: number;
  /**
   * The wizard's clock, epoch ms. Moved only by `usePriceHold`'s timers, so the
   * form re-prices at the moments a promotion starts or ends without
   * re-rendering every second for nothing.
   */
  now: number;
  setNow: (at: number) => void;
  /** Wired to the form's input and change events; asks for a lock once. */
  start: () => void;
}

/**
 * `slipPicked` is true once a bank-transfer runner has a deposit slip in the
 * form: they have sent money at the held total, so the lock is kept into the
 * server's grace instead of renewed at the deadline (see the renewal below).
 */
export function usePriceLock(eventId: string, slipPicked = false): PriceLockState {
  const [lock, setLock] = useState<HeldLock | null>(null);
  const [renewals, setRenewals] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const requested = useRef(false);
  // When a failed request lets `start` ask again (RETRY_AFTER_MS).
  const retryAt = useRef(0);

  const requestLock = useCallback(async (): Promise<HeldLock | null> => {
    try {
      const response = await fetch("/api/price-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      const lockedAt = Date.parse(data?.lockedAt);
      const expiresAt = Date.parse(data?.expiresAt);
      if (typeof data?.token !== "string" || !lockedAt || !expiresAt) return null;
      return {
        token: data.token,
        lockedAt,
        expiresAt,
        renewAt: Date.now() + (expiresAt - lockedAt),
      };
    } catch {
      return null;
    }
  }, [eventId]);

  // A request that came back empty frees `start` to ask again, a minute on,
  // so a throttled or failed lock is not lost for the rest of the session.
  const allowRetry = useCallback(() => {
    requested.current = false;
    retryAt.current = Date.now() + RETRY_AFTER_MS;
  }, []);

  const start = useCallback(() => {
    if (requested.current || Date.now() < retryAt.current) return;
    requested.current = true;
    void requestLock().then((held) => {
      if (!held) {
        allowRetry();
        return;
      }
      setLock(held);
      setNow(Date.now());
    });
  }, [requestLock, allowRetry]);

  // Renew at the deadline the runner was shown. A renewal that fails drops to
  // no lock rather than keeping the old one into its grace: the runner was told
  // the hold ends here, and pricing at now is what they would get anyway.
  //
  // The one exception is a runner with a deposit slip picked: they transferred
  // the held total, so the old lock — the token the checkout reads — is kept
  // through the server's grace, which exists for exactly this, and renewed only
  // just before it lapses. Removing the slip renews at once.
  useEffect(() => {
    if (!lock) return;
    const renewAt = lock.renewAt + (slipPicked ? SLIP_HOLD_MS : 0);
    const timer = setTimeout(async () => {
      const next = await requestLock();
      if (!next) allowRetry();
      setLock(next);
      setRenewals((count) => count + 1);
      setNow(Date.now());
    }, Math.max(0, renewAt - Date.now()));
    return () => clearTimeout(timer);
  }, [lock, requestLock, allowRetry, slipPicked]);

  return {
    token: lock?.token ?? null,
    lockedAt: lock?.lockedAt ?? null,
    expiresAt: lock?.expiresAt ?? null,
    renewAt: lock?.renewAt ?? null,
    renewals,
    now,
    setNow,
    start,
  };
}

export interface PriceCountdown {
  /** The promotion's own name, as the summary lists it. */
  name: string;
  /** True once the lock holds the price; false while the promotion is live. */
  held: boolean;
  remainingMs: number;
  /** Under five minutes: amber, and a bank transfer is told to wait. */
  urgent: boolean;
}

export interface PriceNotice {
  from: number;
  to: number;
}

/**
 * What the runner is shown about the lock: the countdown, the line a screen
 * reader hears, and the notice when a renewal moved the total.
 *
 * The countdown appears only when the applied discount holds a promotion that
 * ends inside the lock window (D2): before the lock, one ending within 45
 * minutes of now; after it, one ending before the lock does. A promotion that
 * outlives the window would never change the price, so a timer for it would
 * only pressure the runner.
 */
export function usePriceHold({
  priceLock,
  discount,
  promos,
  total,
}: {
  priceLock: PriceLockState;
  discount: AppliedDiscount | null;
  /** The automatic promotions and the typed code, as the pricing weighed them. */
  promos: (PromoTerms | null)[];
  total: number;
}) {
  const { lockedAt, expiresAt, renewAt, now, setNow, renewals } = priceLock;

  // The applied promotion that ends first inside the window, if any.
  const horizon = expiresAt ?? now + LOCK_MS;
  let ending: { name: string; endsAt: number } | null = null;
  for (const part of discountParts(discount)) {
    const terms = promos.find((candidate) => candidate?.code === part.code);
    const endsAt = endOf(terms);
    if (endsAt === null || endsAt >= horizon) continue;
    if (endsAt <= (lockedAt ?? now)) continue;
    if (!ending || endsAt < ending.endsAt) ending = { name: part.code, endsAt };
  }

  const held = lockedAt !== null;
  const deadline = ending ? (held ? (renewAt as number) : ending.endsAt) : null;
  const countdown: PriceCountdown | null =
    ending && deadline !== null
      ? {
          name: ending.name,
          held,
          remainingMs: Math.max(0, deadline - now),
          urgent: deadline - now < PRICE_HOLD_WARNING_MS,
        }
      : null;

  // Said aloud twice only — at five minutes and at the end — never every
  // second: a live region that ticks is a screen reader that never stops.
  const [announcement, setAnnouncement] = useState("");
  const name = ending?.name ?? null;

  // While a countdown is on screen the clock moves every second. Otherwise it
  // moves once, at the next moment a promotion starts, comes within the
  // window, or ends — after the lock, the renewal above is that moment.
  const nextMoment = held ? null : nextPromoMoment(promos, now);
  useEffect(() => {
    if (deadline !== null && name !== null) {
      let warned = deadline - Date.now() < PRICE_HOLD_WARNING_MS;
      const tick = setInterval(() => {
        const at = Date.now();
        setNow(at);
        if (!warned && deadline - at < PRICE_HOLD_WARNING_MS) {
          warned = true;
          setAnnouncement(
            held
              ? `5 minutes left on the ${name} price held for you.`
              : `${name} ends in 5 minutes.`,
          );
        }
      }, 1000);
      // The end gets its own timer rather than the next tick: a renewal can
      // land between two ticks, take the countdown away, and leave the end
      // unannounced.
      // One past the deadline: a promotion's last millisecond is still its own
      // (promoStatus: until < at), so a clock landing on it exactly hides the
      // countdown but leaves the cards on the sale price, with nothing left
      // to move the clock again.
      const end = setTimeout(() => {
        setNow(Math.max(Date.now(), deadline + 1));
        setAnnouncement(
          held ? `The ${name} price is no longer held.` : `${name} has ended.`,
        );
      }, Math.max(0, deadline - Date.now()));
      return () => {
        clearInterval(tick);
        clearTimeout(end);
      };
    }
    if (nextMoment === null) return;
    const wait = Math.min(Math.max(0, nextMoment - Date.now()), LONGEST_WAIT_MS);
    // Never short of the moment: a timer that woke a millisecond early would
    // leave the clock before it, the same moment would be chosen again, and
    // nothing would ever wake the form.
    const timer = setTimeout(
      () => setNow(wait < LONGEST_WAIT_MS ? Math.max(Date.now(), nextMoment) : Date.now()),
      wait,
    );
    return () => clearTimeout(timer);
  }, [deadline, name, held, nextMoment, setNow]);

  // A renewal that moved the total, kept until the runner dismisses it. Worked
  // out while rendering, React's way of adjusting state to a changed input:
  // the render that brings the new lock is the one that brings the new total,
  // so the total seen before it is the old one.
  const [notice, setNotice] = useState<PriceNotice | null>(null);
  const [seen, setSeen] = useState({ renewals, total });
  if (seen.renewals !== renewals || seen.total !== total) {
    if (seen.renewals !== renewals && seen.total !== total) {
      setNotice({ from: seen.total, to: total });
    }
    setSeen({ renewals, total });
  }

  return {
    countdown,
    announcement,
    notice,
    dismissNotice: () => setNotice(null),
  };
}

function endOf(promo: PromoTerms | null | undefined): number | null {
  if (!promo?.validUntil) return null;
  const at = new Date(promo.validUntil).getTime();
  return Number.isNaN(at) ? null : at;
}

/**
 * The next moment any of these promotions changes what the form shows: one
 * starting, one coming within the lock window (its countdown appears), or one
 * ending (the price flips).
 */
function nextPromoMoment(promos: (PromoTerms | null)[], now: number): number | null {
  let next: number | null = null;
  for (const promo of promos) {
    if (!promo) continue;
    const from = promo.validFrom ? new Date(promo.validFrom).getTime() : NaN;
    const until = endOf(promo);
    const moments = [from, until === null ? NaN : until - LOCK_MS, until ?? NaN];
    for (const at of moments) {
      if (Number.isNaN(at) || at <= now) continue;
      if (next === null || at < next) next = at;
    }
  }
  return next;
}
