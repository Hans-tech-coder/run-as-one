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
 * How many callers we will remember at once.
 *
 * A map keyed by address grows with every new address, and a serverless
 * instance that lives for hours under a scan would otherwise hold one entry
 * per attacker IP for ever. Past this ceiling the map is swept and, failing
 * that, dropped: forgetting who has been asking makes the throttle useless for
 * a moment, which is the safe direction — the alternative is a route that
 * refuses everyone because its own bookkeeping filled up.
 */
const MAX_TRACKED_KEYS = 5_000;

/**
 * The hit times, newest last, per `bucket:key`.
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
    // otherwise push their own window forward for ever.
    hits.set(id, recent);
    return false;
  }

  recent.push(now);
  hits.set(id, recent);

  if (hits.size > MAX_TRACKED_KEYS) sweep(now, rule.windowMs);
  return true;
}

/** Forget every caller whose last request is older than the window. */
function sweep(now: number, windowMs: number) {
  for (const [id, times] of hits) {
    const last = times[times.length - 1];
    if (last === undefined || now - last >= windowMs) hits.delete(id);
  }
  // Still full means the flood is live rather than historical. Start over: a
  // throttle that has forgotten everything is weak for one window, and one
  // that cannot record a new caller is broken until the instance dies.
  if (hits.size > MAX_TRACKED_KEYS) hits.clear();
}

/**
 * Who is asking, as well as we can tell.
 *
 * Vercel sits behind a proxy, so the socket address is Vercel's; the caller is
 * the first hop of `x-forwarded-for`. That header is client-supplied and a
 * determined caller can rotate it freely — one more reason this module claims
 * only to stop the naive case. Everything unidentifiable shares a single
 * bucket, which is fine while the limit is generous: it is a shared allowance
 * for callers we cannot tell apart, not a block.
 */
export function callerKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip')?.trim() || 'unknown';
}
