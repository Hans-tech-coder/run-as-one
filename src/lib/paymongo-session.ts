import { paymongoPaymentType } from '@/lib/registration-codes';

/**
 * The PayMongo payment page an order is sent to, built in one place for the
 * two doors that open one: the checkout (`api/checkout`) when the order is
 * placed, and the resume-payment link (`api/pay/[token]`) when staff hand an
 * unpaid order back to its runner (UNPAID_FOLLOWUP_PLAN.md Batch 3).
 *
 * **Rebuilt from the order, never from a request.** The resume path reads a
 * stored registration, so everything here takes the figures the checkout
 * already checked and wrote: the same `reference_number` (`orderRef`), the
 * same total, the same method. A second page for one order is therefore one
 * the webhook already recognises — it matches by stored id, then falls back to
 * `reference_number` (api/webhooks/paymongo).
 *
 * **Two PayMongo shapes, by method.** Card and QRPh go through a Checkout
 * Session (`cs_…`); GCash and Maya through a Payment Intent with a payment
 * method attached (`pi_…`), which redirects straight to the wallet. Whichever
 * id comes back is what the order stores in `checkoutSessionId`, and what
 * `retirePaymongoPage` below and `lookUpPaymongoPayment` (online-payment.ts)
 * read.
 */

type LineItem = { currency: 'PHP'; amount: number; name: string; quantity: 1 };

/** The order as the line items see it, every amount in centavos. */
export type PaymongoOrder = {
  orderRef: string;
  /** What PayMongo charges: the order's `totalAmount`. */
  amountCents: number;
  /** The stored method, e.g. `QRPH` or `GCASH`. */
  paymentMethod: string;
  description: string;
  customerName: string;
  customerEmail: string;
  /** Each runner's category, in runner order. */
  runners: { categoryName: string; categoryPrice: number }[];
  /** The goods before any discount (the order's `subtotal`). */
  subtotalCents: number;
  discountAmount: number;
  promoCode: string | null;
  deliveryFeeCents: number;
  platformFeeCents: number;
  transactionFeeCents: number;
};

/**
 * The order as an itemised bill. Every amount is already in centavos, which
 * is also the unit PayMongo expects — so no conversion happens here.
 */
export function paymongoLineItems(order: PaymongoOrder): LineItem[] {
  const lineItems: LineItem[] = [];

  // Add runners.
  //
  // A discounted order is billed as one collapsed goods line instead.
  // PayMongo totals a checkout session from its line items and will not take
  // a negative one, so a discount cannot be shown as its own subtracted row
  // — and per-runner prices that still added up to the full subtotal would
  // charge the runner more than the summary promised. The itemisation the
  // runner needs is in the wizard's summary and in both emails; what this
  // list has to be is exactly the amount being charged.
  if (order.discountAmount > 0) {
    // A code that covers the goods entirely leaves nothing to bill for them,
    // and PayMongo rejects a zero-amount line — the fees below are then the
    // whole charge.
    const goodsAfterDiscount = order.subtotalCents - order.discountAmount;
    if (goodsAfterDiscount > 0) {
      const count = order.runners.length;
      lineItems.push({
        currency: 'PHP',
        amount: goodsAfterDiscount,
        name: `Registration — ${count} runner${count === 1 ? '' : 's'} (${order.promoCode} applied)`,
        quantity: 1,
      });
    }
  } else {
    order.runners.forEach((runner, index) => {
      lineItems.push({
        currency: 'PHP',
        amount: runner.categoryPrice,
        name: `Runner ${index + 1} (${runner.categoryName})`,
        quantity: 1,
      });
    });
  }

  if (order.deliveryFeeCents > 0) {
    lineItems.push({ currency: 'PHP', amount: order.deliveryFeeCents, name: 'Delivery Fee', quantity: 1 });
  }
  if (order.platformFeeCents > 0) {
    lineItems.push({ currency: 'PHP', amount: order.platformFeeCents, name: 'Admin Fee', quantity: 1 });
  }
  if (order.transactionFeeCents > 0) {
    lineItems.push({ currency: 'PHP', amount: order.transactionFeeCents, name: 'Transaction Fee', quantity: 1 });
  }

  // Fallback if lineItems is empty somehow (shouldn't happen)
  if (lineItems.length === 0) {
    lineItems.push({ currency: 'PHP', amount: order.amountCents, name: 'Registration Fee', quantity: 1 });
  }
  return lineItems;
}

/** A stored registration, as `paymongoOrderFromRegistration` reads it. */
type StoredOrder = {
  orderRef: string;
  totalAmount: number;
  paymentMethod: string;
  customerName: string;
  customerEmail: string;
  subtotal: number;
  discountAmount: number;
  promoCode: string | null;
  deliveryFee: number;
  platformFee: number;
  transactionFee: number;
  event: { title: string };
  /** Live runners only, in runner order. */
  runners: { category: { name: string; price: number } }[];
};

/**
 * A stored order as PayMongo bills it. The description is the one the
 * registration wizard sends, so the runner's second payment page reads like
 * their first.
 */
export function paymongoOrderFromRegistration(order: StoredOrder): PaymongoOrder {
  return {
    orderRef: order.orderRef,
    amountCents: order.totalAmount,
    paymentMethod: order.paymentMethod,
    description: `Registration for ${order.event.title}`,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    runners: order.runners.map(r => ({ categoryName: r.category.name, categoryPrice: r.category.price })),
    subtotalCents: order.subtotal,
    discountAmount: order.discountAmount,
    promoCode: order.promoCode,
    deliveryFeeCents: order.deliveryFee,
    platformFeeCents: order.platformFee,
    transactionFeeCents: order.transactionFee,
  };
}

/** What opening a payment page came to. */
export type PaymongoPage =
  | { ok: true; id: string; checkoutUrl: string }
  /** PayMongo refused one of its calls; `error` and `details` as the checkout
   *  route has always answered them. */
  | { ok: false; status: number; error: string; details: unknown };

function authHeader(secretKey: string): string {
  return `Basic ${Buffer.from(secretKey).toString('base64')}`;
}

/**
 * Opens a PayMongo payment page for the order and returns its id and URL.
 * Writes nothing: the caller stores the id, because only it knows whether it
 * is the first page for this order or a replacement.
 */
export async function openPaymongoPage(
  secretKey: string,
  order: PaymongoOrder,
  urls: { successUrl: string; cancelUrl: string },
): Promise<PaymongoPage> {
  const method = order.paymentMethod;

  // Branch logic: Use Payment Intents API for direct e-wallets redirect, otherwise use Checkout Session
  if (method === 'GCASH' || method === 'MAYA' || method === 'PAYMAYA') {
    const auth = authHeader(secretKey);

    // 1. Create Payment Intent
    const piRes = await fetch('https://api.paymongo.com/v1/payment_intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: order.amountCents,
            payment_method_allowed: [paymongoPaymentType(method)],
            currency: 'PHP',
            description: order.description,
          },
        },
      }),
    });
    const piData = await piRes.json();
    if (!piRes.ok) {
      return { ok: false, status: piRes.status, error: 'Failed to create payment intent', details: piData };
    }
    const piId = piData.data.id;

    // 2. Create Payment Method
    const pmRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        data: {
          attributes: {
            type: paymongoPaymentType(method),
            billing: { name: order.customerName, email: order.customerEmail },
          },
        },
      }),
    });
    const pmData = await pmRes.json();
    if (!pmRes.ok) {
      return { ok: false, status: pmRes.status, error: 'Failed to create payment method', details: pmData };
    }
    const pmId = pmData.data.id;

    // 3. Attach Payment Method to Payment Intent
    const attachRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${piId}/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        data: { attributes: { payment_method: pmId, return_url: urls.successUrl } },
      }),
    });
    const attachData = await attachRes.json();
    if (!attachRes.ok) {
      return { ok: false, status: attachRes.status, error: 'Failed to attach payment method', details: attachData };
    }

    const redirectUrl = attachData.data?.attributes?.next_action?.redirect?.url;
    if (!redirectUrl) {
      return { ok: false, status: 500, error: 'Failed to get redirect URL from PayMongo', details: attachData };
    }
    // The intent id stands in for a checkout session id on the order.
    return { ok: true, id: piId, checkoutUrl: redirectUrl };
  }

  // Default to Checkout Session for card and qrph
  const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: authHeader(secretKey),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          description: order.description,
          reference_number: order.orderRef,
          line_items: paymongoLineItems(order),
          payment_method_types: [paymongoPaymentType(method)],
          success_url: urls.successUrl,
          cancel_url: urls.cancelUrl,
          customer_email: order.customerEmail,
          billing: { name: order.customerName, email: order.customerEmail },
        },
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error('PayMongo API Error:', data);
    return { ok: false, status: response.status, error: 'Failed to create checkout session', details: data };
  }
  return { ok: true, id: data.data.id, checkoutUrl: data.data.attributes.checkout_url };
}

/**
 * Closes an order's earlier payment page so it can no longer take money, before
 * a new one is opened — otherwise a runner holding both could pay twice for one
 * order. Per PayMongo's API reference (checked 2026-10-05):
 *
 * - `POST /v1/checkout_sessions/{id}/expire` — the session stops accepting
 *   payments, and its payment intent is cancelled with it. Refused (400) when
 *   the session is already expired, or has a paid or ongoing payment.
 * - `POST /v1/payment_intents/{id}/cancel` for a GCash / Maya intent.
 *
 * A refusal is not taken at its word, since "already expired" and "a payment
 * is under way" share one status code: the page is read back, and only one
 * that is now `expired` or `cancelled` counts as closed. The caller has already
 * asked whether it was paid (`lookUpPaymongoPayment`), so a page still open here
 * means a payment may be in flight, and no second page is opened.
 */
export async function retirePaymongoPage(
  secretKey: string,
  pageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resource = pageId.startsWith('cs_') ? 'checkout_sessions' : pageId.startsWith('pi_') ? 'payment_intents' : null;
  // Nothing PayMongo knows by that id, so nothing that could still be paid.
  if (!resource) return { ok: true };
  const action = resource === 'checkout_sessions' ? 'expire' : 'cancel';
  const headers = { accept: 'application/json', authorization: authHeader(secretKey) };
  const url = `https://api.paymongo.com/v1/${resource}/${encodeURIComponent(pageId)}`;

  try {
    const res = await fetch(`${url}/${action}`, { method: 'POST', headers });
    if (res.ok) return { ok: true };
    // A live-mode id asked with a test key (a database copied down from
    // production): this account cannot reach it, and neither can its payer
    // through any page this account would open.
    if (res.status === 404) return { ok: true };

    const check = await fetch(url, { headers, cache: 'no-store' });
    const body = await check.json().catch(() => null);
    const status = body?.data?.attributes?.status;
    if (status === 'expired' || status === 'cancelled') return { ok: true };
    console.error(`PayMongo ${action} for ${pageId} answered ${res.status}; page is ${status}`);
  } catch (error) {
    console.error(`PayMongo ${action} for ${pageId} failed:`, error);
  }
  return {
    ok: false,
    error: 'The earlier payment page for this order is still open, and a payment on it may be under way. Wait a few minutes and try again.',
  };
}
