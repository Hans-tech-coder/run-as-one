"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { MAX_RUNNERS_PER_ORDER } from '@/lib/order-size';
import { defaultDeliveryZone, deliveryProvinceOf, needsDeliveryZoneChoice } from '@/app/events/[slug]/register/delivery';
import { hasErrors, validateRunner, validateRunners, type RunnerErrors, type RunnerField } from '@/app/events/[slug]/register/validation';
import { staffError } from '../reference-held';
import StaffRunnerFields, { staffFieldId } from './StaffRunnerFields';
import StaffOrderPanel, { ORDER_FIELD_IDS, type OrderErrors } from './StaffOrderPanel';
import StaffTotalPanel from './StaffTotalPanel';
import {
  deliveryAddressFor,
  emptyRunner,
  resolvedRunners,
  orderFormData,
  toParticipants,
  withoutRunner,
  type Kit,
  type OrderDraft,
  type Quote,
  type StaffEvent,
  type StaffRunner,
} from './staff-registration';

/**
 * The staff registration form (STAFF_REGISTRATION_PLAN.md step 4): a
 * validator encodes a runner — or a group — who registered over Messenger
 * or a call. A full page, not a modal, because a group order is long.
 *
 * Runners are checked with the wizard's own `validateRunners`, so the rules
 * cannot drift from the website's. The total is the server's quote of the
 * order as it stands, refreshed as staff type; the save is refused if it
 * changed since. A failed save keeps every value and lists what to fix at
 * the top, each item a link to its field.
 */

type SummaryItem = { id: string; message: React.ReactNode };

const ORDER_LABELS: Record<keyof OrderErrors, string> = {
  zone: 'Delivery area',
  proofFile: 'Payment screenshot',
  transactionNumber: 'Reference No.',
  paidTo: 'Paid to',
  consent: 'Waiver consent',
};

/** "RM-2611-ABCD is already…" with each order ref a link to its row. */
function withOrderLinks(message: string, refs: string[], eventId: string): React.ReactNode {
  if (refs.length === 0) return message;
  const pattern = new RegExp(`(${refs.map(ref => ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);
  return message.split(pattern).map((part, i) =>
    refs.includes(part) ? (
      <Link key={i} href={`/admin/events/${eventId}/registrants?search=${encodeURIComponent(part)}`} className="font-semibold underline underline-offset-2">
        {part}
      </Link>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

export default function StaffRegistrationForm({
  event,
  canValidate,
}: {
  event: StaffEvent;
  /** Whether this staff member may validate, and so tick "I checked the money landed". */
  canValidate: boolean;
}) {
  const router = useRouter();
  const soleCategory = event.soleCategoryId;
  const [runners, setRunners] = useState<StaffRunner[]>(() => [emptyRunner(0, soleCategory)]);
  const [kit, setKitState] = useState<Kit>(() => ({
    method: event.pickup ? 'PICKUP' : 'DELIVERY',
    zone: defaultDeliveryZone(event) ?? '',
    zip: '',
    landmark: '',
  }));
  const [order, setOrderState] = useState<OrderDraft>(() => ({
    promoCode: '',
    transactionNumber: '',
    // One account needs no choice: it is that one (staffPaidTo).
    paidTo: event.bankAccounts.length === 1 ? event.bankAccounts[0] : '',
    proofFile: null,
    consent: false,
    paymentChecked: false,
  }));
  const [promoInput, setPromoInput] = useState('');
  // Clubs written in on this form, shared across its runners.
  const [addedCommunities, setAddedCommunities] = useState<string[]>([]);
  const [runnerErrors, setRunnerErrors] = useState<RunnerErrors[]>([]);
  const [orderErrors, setOrderErrors] = useState<OrderErrors>({});
  const [summary, setSummary] = useState<SummaryItem[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string>('');
  const [quoting, setQuoting] = useState(false);
  // Which inputs `quote` was drawn for, and a nudge to ask again when the
  // server says a figure moved while the inputs did not.
  const [quotedKey, setQuotedKey] = useState('');
  const [requote, setRequote] = useState(0);
  const [saving, setSaving] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const setKit = (patch: Partial<Kit>) => setKitState(current => ({ ...current, ...patch }));
  const setOrder = (patch: Partial<OrderDraft>) => setOrderState(current => ({ ...current, ...patch }));

  // The wizard's checks read these parts of the event; every add-on here is
  // on sale now (the page passes only those), the checkout re-reads its stock.
  const validatedEvent = useMemo(
    () => ({
      eventType: event.eventType,
      date: event.date,
      categories: event.categories,
      addOns: event.addOns.map(item => ({ ...item, active: true, soldBy: 'ORGANIZER', stockLimit: null, salesCloseAt: null })),
    }),
    [event],
  );

  // What the price depends on, and nothing else, so typing a name never
  // re-asks the server.
  const priced = useMemo(() => {
    const participants = toParticipants(runners).map(p => ({
      categoryId: p.categoryId,
      singletSize: p.singletSize,
      addOns: p.addOns,
      addressProvince: p.addressProvince,
    }));
    return {
      participants,
      logisticsMethod: kit.method,
      deliveryZone: kit.method === 'DELIVERY' ? kit.zone : '',
      deliveryAddress: deliveryAddressFor(kit, runners),
      promoCode: order.promoCode,
    };
  }, [runners, kit, order.promoCode]);
  const pricedKey = JSON.stringify(priced);
  const allCategorized = priced.participants.every(p => p.categoryId);
  // Also true in the debounce before a request goes out, so Save never sends
  // a total drawn for inputs that have since changed.
  const isQuoting = quoting || (allCategorized && quotedKey !== pricedKey);

  useEffect(() => {
    // Nothing to price until every runner has a category; the panel says so
    // and the save's own checks name the runner missing one.
    if (!allCategorized) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const res = await fetch(`/api/admin/events/${event.id}/registrations/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: pricedKey,
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setQuote(data as Quote);
          setQuoteError('');
        } else {
          setQuote(null);
          setQuoteError(typeof data.error === 'string' ? data.error : 'The total could not be worked out.');
        }
        setQuotedKey(pricedKey);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setQuote(null);
          setQuoteError('The total could not be worked out. Check the connection.');
          setQuotedKey(pricedKey);
        }
      } finally {
        if (!controller.signal.aborted) setQuoting(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
      // An aborted request never reaches its own reset; the next run, if any,
      // sets it again when it sends.
      setQuoting(false);
    };
  }, [pricedKey, allCategorized, event.id, requote]);

  const changeRunner = (index: number, patch: Partial<StaffRunner>) => {
    setRunners(current => current.map((runner, i) => (i === index ? { ...runner, ...patch } : runner)));
    setRunnerErrors(current => {
      if (!current[index]) return current;
      const next = [...current];
      const cleared = { ...next[index] };
      for (const field of Object.keys(patch)) delete cleared[field as RunnerField];
      next[index] = cleared;
      return next;
    });
  };

  // One field, checked as staff leave it, with the save's own rule — only a
  // filled one, so tabbing through an empty form does not paint it red.
  const checkField = (index: number, field: RunnerField) => {
    const runner = resolvedRunners(runners)[index];
    const value = runner?.[field as keyof StaffRunner];
    if (typeof value !== 'string' || value.trim() === '') return;
    const message = validateRunner(runner, validatedEvent)[field];
    setRunnerErrors(current => {
      const next = [...current];
      next[index] = { ...next[index], [field]: message };
      return next;
    });
  };

  const showSummary = (items: SummaryItem[]) => {
    setSummary(items);
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    // Checked as the order will carry them, Runner 1's email and emergency
    // contact copied in. A copied field's error is Runner 1's to fix, so it
    // is reported there only, never on a field the runner below cannot see.
    const perRunner = validateRunners(resolvedRunners(runners), validatedEvent).map((errors, index) => {
      if (index === 0) return errors;
      const own = { ...errors };
      if (runners[index].emailSameAsFirst) delete own.email;
      if (runners[index].emergencySameAsFirst) {
        delete own.emergencyContactName;
        delete own.emergencyContactPhone;
      }
      return own;
    });
    const orderProblems: OrderErrors = {};
    if (kit.method === 'DELIVERY' && !deliveryProvinceOf(event) && needsDeliveryZoneChoice(event) && !kit.zone) {
      orderProblems.zone = 'Choose the delivery area';
    }
    if (!order.proofFile) orderProblems.proofFile = 'Attach the screenshot of the payment the runner sent';
    if (!order.transactionNumber.trim()) orderProblems.transactionNumber = 'Enter the GCash or bank reference number of the payment';
    if (event.bankAccounts.length > 1 && !order.paidTo) orderProblems.paidTo = 'Choose the account the payment went into';
    if (!order.consent) orderProblems.consent = 'Confirm the runner agreed to the waiver';

    const items: SummaryItem[] = [];
    perRunner.forEach((errors, index) => {
      for (const [field, message] of Object.entries(errors)) {
        if (!message) continue;
        const who = runners.length > 1 ? `Runner ${index + 1}: ` : '';
        items.push({ id: staffFieldId(index, field as RunnerField), message: `${who}${message}` });
      }
    });
    for (const [field, message] of Object.entries(orderProblems)) {
      items.push({ id: ORDER_FIELD_IDS[field as keyof OrderErrors], message: `${ORDER_LABELS[field as keyof OrderErrors]}: ${message}` });
    }
    if (!quote && quoteError) items.push({ id: 'staff-total', message: quoteError });
    if (quote?.free) items.push({ id: 'staff-total', message: 'This order comes to ₱0. A free entry is not added from here.' });

    setRunnerErrors(perRunner);
    setOrderErrors(orderProblems);
    if (hasErrors(perRunner) || items.length > 0 || !quote || isQuoting) {
      showSummary(items.length > 0 ? items : [{ id: 'staff-total', message: 'Wait for the total to finish updating, then save.' }]);
      return;
    }

    setSaving(true);
    setSummary([]);
    try {
      const res = await fetch(`/api/admin/events/${event.id}/registrations`, {
        method: 'POST',
        body: orderFormData(event, runners, kit, order, quote),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push(`/admin/events/${event.id}/registrants?search=${encodeURIComponent(data.orderRef)}`);
        return;
      }
      // A figure moved since the total was drawn: show the new one and ask
      // for a second look rather than saving a different amount.
      if (data.code === 'priceChanged') {
        // Some refusals carry no total, so ask for a fresh quote either way;
        // Save waits for it.
        setQuote(current => (current && typeof data.total === 'number' ? { ...current, ...data } : current));
        setQuotedKey('');
        setRequote(n => n + 1);
        showSummary([{ id: 'staff-total', message: 'The price changed while you were typing. Check the new total, then save again.' }]);
        return;
      }
      const message =
        data.code === 'runnerAlreadyRegistered'
          ? withOrderLinks(String(data.error), Array.isArray(data.orderRefs) ? data.orderRefs : [], event.id)
          : staffError(data, 'This order could not be saved. Nothing was saved; try again.');
      const field = data.field as keyof OrderErrors | undefined;
      if (field && field in ORDER_FIELD_IDS) {
        setOrderErrors(current => ({ ...current, [field]: message }));
        showSummary([{ id: ORDER_FIELD_IDS[field], message }]);
      } else {
        showSummary([{ id: 'staff-runners', message }]);
      }
    } catch {
      showSummary([{ id: 'staff-total', message: 'The connection dropped before the order was saved. Check the registrants list before trying again.' }]);
    } finally {
      setSaving(false);
    }
  };



  return (
    <form onSubmit={handleSubmit} className="admin-form" noValidate>
      {summary.length > 0 && (
        <div
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
          aria-labelledby="staff-summary-title"
          className="rounded-panel border border-[var(--status-danger)] bg-[var(--dash-surface)] px-5 py-4 outline-none"
        >
          <h2 id="staff-summary-title" className="m-0 mb-2 text-base font-semibold text-primary">
            {summary.length === 1 ? 'One thing to fix before saving' : `${summary.length} things to fix before saving`}
          </h2>
          <ul className="m-0 pl-5 flex flex-col gap-1 text-sm">
            {summary.map((item, i) => (
              <li key={i}>
                <a
                  href={`#${item.id}`}
                  onClick={ev => {
                    const target = document.getElementById(item.id);
                    if (!target) return;
                    ev.preventDefault();
                    target.scrollIntoView({ block: 'center' });
                    target.focus({ preventScroll: true });
                  }}
                  className="text-primary underline underline-offset-2"
                >
                  {item.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div id="staff-runners" tabIndex={-1} className="flex flex-col gap-6 outline-none">
        {runners.map((runner, index) => (
          <StaffRunnerFields
            key={runner.key}
            index={index}
            count={runners.length}
            runner={runner}
            first={runners[0]}
            event={event}
            addedCommunities={addedCommunities}
            onAddCommunity={name => setAddedCommunities(current => (current.includes(name) ? current : [...current, name]))}
            onCheck={field => checkField(index, field)}
            errors={runnerErrors[index] ?? {}}
            onChange={patch => changeRunner(index, patch)}
            onRemove={() => {
              setRunners(current => withoutRunner(current, index));
              setRunnerErrors(current => current.filter((_, i) => i !== index));
            }}
          />
        ))}
      </div>

      {runners.length < MAX_RUNNERS_PER_ORDER && (
        <button
          type="button"
          className="btn-light inline-flex items-center justify-center gap-2 self-start min-h-11"
          onClick={() => setRunners(current => [...current, emptyRunner(current.length, soleCategory)])}
          disabled={saving}
        >
          <Plus size={16} aria-hidden="true" />
          Add Another Runner
        </button>
      )}

      <StaffOrderPanel
        event={event}
        kit={kit}
        setKit={setKit}
        order={order}
        setOrder={setOrder}
        errors={orderErrors}
        clearError={field => setOrderErrors(current => ({ ...current, [field]: undefined }))}
        setProofError={message => setOrderErrors(current => ({ ...current, proofFile: message }))}
        disabled={saving}
        canValidate={canValidate}
      />

      <StaffTotalPanel
        runnerCount={runners.length}
        promoInput={promoInput}
        setPromoInput={setPromoInput}
        appliedCode={order.promoCode}
        applyCode={promoCode => setOrder({ promoCode })}
        allCategorized={allCategorized}
        quote={quote}
        quoteError={quoteError}
        quoting={isQuoting}
        disabled={saving}
      />

      <div className="form-actions">
        <Link href={`/admin/events/${event.id}/registrants`} className="btn-cancel">
          Cancel
        </Link>
        <button type="submit" disabled={saving || isQuoting} className="btn-light">
          {saving ? (
            <BusyLabel>Saving</BusyLabel>
          ) : (
            `${order.paymentChecked ? 'Save as Paid' : runners.length > 1 ? `Save ${runners.length} Runners` : 'Save Registration'}`
          )}
        </button>
      </div>
    </form>
  );
}
