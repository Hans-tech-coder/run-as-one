/**
 * All money in this app is stored and passed around as INTEGER CENTAVOS.
 *
 * Rationale: floats cannot represent 0.1 exactly, so peso arithmetic drifts.
 * PayMongo already bills in centavos, so integers also remove a conversion at
 * the payment boundary.
 *
 * The rule: convert pesos -> centavos when data ENTERS (forms, API payloads),
 * convert centavos -> pesos only when data is DISPLAYED. Never in between.
 */

/** Peso amount from a form or API payload -> centavos for storage. */
export function toCentavos(pesos: number | string | null | undefined): number {
  const n = typeof pesos === 'string' ? parseFloat(pesos) : pesos;
  if (n == null || !Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Centavos -> peso number. For display and for prefilling peso form inputs. */
export function toPesos(centavos: number | null | undefined): number {
  if (centavos == null || !Number.isFinite(centavos)) return 0;
  return centavos / 100;
}

/** Centavos -> "1,234.50". No currency symbol; add ₱ at the call site. */
export function formatPesos(centavos: number | null | undefined): string {
  return toPesos(centavos).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
