'use client';

/**
 * Pay now on the resume-payment page. Posts to `api/pay/[token]`, which opens a
 * fresh PayMongo page for the order, and sends the runner there.
 *
 * An answer carrying a `state` means the order moved while the page sat open
 * (paid through a late webhook, cancelled, expired): the page is read again,
 * so the runner sees that state's own panel rather than an error here. Any
 * other refusal is said in place, under the button, in the route's words.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';

export default function PayNowButton({ token, amount }: { token: string; amount: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pay/${encodeURIComponent(token)}`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.checkout_url) {
        // Left busy: the browser is on its way to PayMongo.
        window.location.href = body.checkout_url;
        return;
      }
      if (body.state) {
        router.refresh();
      } else {
        setError(body.error ?? 'The payment page could not be opened. Try again.');
      }
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="btn-gradient min-h-[44px] w-full justify-center rounded-[16px] px-8 py-4 text-base shadow-xl shadow-accent-orange/20 disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? (
          <BusyLabel>Opening PayMongo</BusyLabel>
        ) : (
          <>
            <Lock size={18} aria-hidden="true" className="shrink-0" />
            <span>Pay {amount} Now</span>
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="m-0 text-center text-sm font-medium text-red-400">
          {error}
        </p>
      )}
    </>
  );
}
