/**
 * A throttle for the routes anyone on the internet can call.
 *
 * **Be clear about what this is.** It is a sliding window held in the memory
 * of one running instance. Vercel runs however many instances it likes and
 * they share nothing, so a request that lands on a cold instance starts with
 * an empty window: this stops a naive script hammering one endpoint from one
 * address, and it does not stop a distributed one. The honest fix is a shared
 * counter in Redis, and there is no Redis in this project — adding one for a
 * promo-code endpoint would cost more, monthly, than the abuse it prevents
 * (§2, the hosting budget is a constraint here, not a footnote).
 *
 * So it is deliberately crude and deliberately generous: it must never be the
 * reason a real runner cannot use a real code, which is why the windows it is
 * configured with sit far above anything a person does by hand.
 */

/** How many requests one caller may make, and over what stretch of time. */
export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

/**
 * The public promo lookup: 20 tries a minute from one address.
 *
 * A runner clicks Apply once per code they were given, so nobody typing in
 * good faith comes near this — even a household or an office behind one NAT
 * address would need twenty people applying codes in the same minute. A script
 * walking the alphabet reaches it in a second. The ceiling is generous on
 * purpose because of what a refusal looks like: the route answers a throttled
 * caller exactly as it answers a code we do not have, so a legitimate caller
 * who somehow hit the wall would be told their code does not exist. Being wrong
 * in that direction is worse than letting a slow script keep guessing.
 */
export const PROMO_LOOKUP_RULE: RateLimitRule = { limit: 20, windowMs: 60_000 };

/**
 * The public feedback form: 5 messages every 10 minutes from one address.
 *
 * This one writes a row rather than reading one, so the thing being limited is
 * a table filling with junk rather than a code being guessed. A person sends
 * one message and leaves; five is room for somebody who thought of a second
 * thing, and for a household or a race-day tent sharing one address.
 *
 * A refusal here is allowed to say what it is — see the route's own note. The
 * promo lookup has to disguise its refusals because a distinct answer would
 * teach a guesser something; nothing about "you have sent five messages" is
 * worth hiding, and a real person who hits it needs to know their sixth
 * message did not simply vanish.
 */
export const FEEDBACK_RULE: RateLimitRule = { limit: 5, windowMs: 10 * 60_000 };

/**
 * The resume-payment link (`/pay/[token]` and its Pay now): 20 a minute from
 * one address.
 *
 * A runner opens their link, maybe reloads it, and presses Pay now once or
 * twice. The token is signed, so there is nothing to guess; what this stops is
 * a script making PayMongo pages in a loop — each Pay now closes the last page
 * and opens a new one, which costs a PayMongo call apiece.
 */
export const PAY_LINK_RULE: RateLimitRule = { limit: 20, windowMs: 60_000 };

/**
 * Placing an order (`/api/checkout` and `/api/checkout/manual`, one shared
 * window): 10 a minute from one address.
 *
 * A group registers in one order — every runner rides in the same request — so
 * the person at the keyboard places one, and maybe two or three more if a
 * price changed under them or a category filled. Ten leaves room for that and
 * for a running club or a phone carrier's shared address placing several orders
 * at once on the morning registration opens; a refusal costs a real person a
 * minute's wait, and their order was not written, so nothing is lost by it.
 *
 * What this stops is a script placing orders it never pays for. Each one holds
 * its category slots and any promo use until it is paid or swept
 * (lib/pending-expiry.ts, a day or more), so an unthrottled loop can make a race
 * look sold out for free. The window is shared between the two routes because
 * they spend the same slots: a script must not get twice the allowance by
 * alternating between them.
 */
export const CHECKOUT_RULE: RateLimitRule = { limit: 10, windowMs: 60_000 };

/**
 * How many callers we will remember at once.
 *
 * A map keyed by address grows with every new address, and a serverless
 * instance that lives for hours under a scan would otherwise hold one entry
 * per attacker IP for ever. Past this ceiling the map is swept and, failing
 * that, the callers seen longest ago are forgotten down to `EVICT_TO_KEYS`.
 * Not the whole map: dropping everyone would hand anyone with 5,000 addresses
 * a switch that resets every caller on every route (Strix, after vuln-0002).
 * Forgetting a quiet caller is the safe direction — the alternative is a route
 * that refuses everyone because its own bookkeeping filled up.
 */
const MAX_TRACKED_KEYS = 5_000;

/**
 * How far an over-full map is cut back. Below the ceiling, so a live flood
 * pays for one full sweep per thousand new callers rather than one per request.
 */
const EVICT_TO_KEYS = 4_000;

/**
 * The hit times, newest last, per `bucket:key`.
 *
 * Kept in order of when each caller was last seen, oldest first (`remember`
 * re-inserts on every request), so eviction can take from the front.
 *
 * On `globalThis` for the same reason the Prisma client is (lib/db.ts): `next
 * dev` re-evaluates a module on every edit, and a window that reset itself
 * each time would be a throttle that only works in production.
 */
declare global {
  var rateLimitHits: undefined | Map<string, number[]>;
}

const hits: Map<string, number[]> = globalThis.rateLimitHits ?? new Map();
if (process.env.NODE_ENV !== 'production') globalThis.rateLimitHits = hits;

/**
 * Whether this caller may make this request, counting it if so.
 *
 * `bucket` names the endpoint, so a caller's promo lookups and any future
 * throttled route keep separate windows — one endpoint's script must not lock
 * a person out of another.
 */
export function allowRequest(bucket: string, key: string, rule: RateLimitRule): boolean {
  const now = Date.now();
  const id = `${bucket}:${key}`;

  // Only the hits still inside the window count, which is what makes this a
  // sliding window rather than a fixed one: a caller who spent their whole
  // allowance in the first second is let back in a second at a time, not all
  // at once on a boundary they can wait for.
  const recent = (hits.get(id) ?? []).filter(at => now - at < rule.windowMs);

  if (recent.length >= rule.limit) {
    // Kept, not extended: a caller who keeps knocking while refused would
    // otherwise push their own window forward for ever. Still counted as seen,
    // so a refused script stays at the back of the eviction queue rather than
    // being forgotten — and let back in — by a flood of other addresses.
    remember(id, recent);
    return false;
  }

  recent.push(now);
  remember(id, recent);

  if (hits.size > MAX_TRACKED_KEYS) sweep(now, rule.windowMs);
  return true;
}

/** Store a caller's hits as the most recently seen entry in the map. */
function remember(id: string, times: number[]) {
  hits.delete(id);
  hits.set(id, times);
}

/** Forget every caller whose last request is older than the window. */
function sweep(now: number, windowMs: number) {
  for (const [id, times] of hits) {
    const last = times[times.length - 1];
    if (last === undefined || now - last >= windowMs) hits.delete(id);
  }
  // Still full means the flood is live rather than historical. Forget the
  // callers seen longest ago: one that cannot record a new caller is broken
  // until the instance dies, but the callers active right now — a throttled
  // script among them — keep their windows.
  if (hits.size <= MAX_TRACKED_KEYS) return;
  for (const id of hits.keys()) {
    if (hits.size <= EVICT_TO_KEYS) break;
    hits.delete(id);
  }
}

/**
 * Who is asking, as well as we can tell.
 *
 * Vercel sits behind a proxy, so the socket address is Vercel's; the caller is
 * the first hop of `x-forwarded-for`. Vercel overwrites that header with the
 * address it saw and does not pass on one the client sent, so in production a
 * caller cannot pick their own key (docs: vercel.com/docs/headers/request-headers).
 * Under `next dev` there is no proxy and the header is whatever the client
 * sends; and if this ever sits behind another proxy, or Vercel's trusted-proxy
 * setting is turned on, the first hop is the client's to choose again —
 * revisit this then. Everything unidentifiable shares a single bucket, which is
 * fine while the limit is generous: it is a shared allowance for callers we
 * cannot tell apart, not a block.
 */
export function callerKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip')?.trim() || 'unknown';
}
