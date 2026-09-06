import "dotenv/config";
import prisma from '../src/lib/db';
import {
  asDeliveryZone,
  asLogisticsMethod,
  asPaymentMethod,
} from '../src/lib/registration-codes';

/**
 * Brings rows written before the uppercase rule into line with it.
 *
 * Everything the app writes from now on is already uppercase — the wizards and
 * the admin forms uppercase as you type, and the API uppercases again before
 * the write (see src/lib/text-case.ts and src/lib/registration-codes.ts). This
 * script exists only for the rows that were created earlier: a category still
 * reading "Full Package" in the registrants table, a runner stored as "Juan
 * Dela Cruz", a registration whose paymentMethod is still PayMongo's
 * lowercase "bank_transfer".
 *
 * Deliberately left alone:
 *  - **Email addresses**, on both Runner and Registration. The local part is
 *    case-sensitive on some mail servers, so uppercasing one can stop delivery.
 *  - Event titles, bank names, and everything else the organizer writes as
 *    their own copy.
 *
 * Safe to run twice: a row already uppercase is skipped rather than rewritten.
 *
 * Run: npm run uppercase:existing          (shows what it would change)
 *      npm run uppercase:existing -- --write   (actually writes)
 */

const WRITE = process.argv.includes('--write');

/** Null and empty stay as they are; a value already uppercase is not a change. */
function upper(value: string | null): string | null {
  if (value === null) return null;
  const next = value.trim().toUpperCase();
  return next === value ? null : next;
}

type Change = { table: string; id: string; field: string; from: string; to: string };

async function main() {
  const changes: Change[] = [];
  const note = (table: string, id: string, field: string, from: string | null, to: string | null) => {
    if (to !== null && from !== null) changes.push({ table, id, field, from, to });
  };

  // ── Categories ────────────────────────────────────────────────────────────
  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  for (const c of categories) {
    const name = upper(c.name);
    if (name === null) continue;
    note('Category', c.id, 'name', c.name, name);
    if (WRITE) await prisma.category.update({ where: { id: c.id }, data: { name } });
  }

  // ── Runners ───────────────────────────────────────────────────────────────
  const runners = await prisma.runner.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      gender: true,
      emergencyContactName: true,
      medicalConditions: true,
      runningCommunity: true,
    },
  });
  for (const r of runners) {
    const data: Record<string, string> = {};
    for (const field of [
      'firstName',
      'lastName',
      'gender',
      'emergencyContactName',
      'medicalConditions',
      'runningCommunity',
    ] as const) {
      const next = upper(r[field]);
      if (next === null) continue;
      data[field] = next;
      note('Runner', r.id, field, r[field], next);
    }
    if (WRITE && Object.keys(data).length > 0) {
      await prisma.runner.update({ where: { id: r.id }, data });
    }
  }

  // ── Registrations ─────────────────────────────────────────────────────────
  const registrations = await prisma.registration.findMany({
    select: {
      id: true,
      customerName: true,
      deliveryAddress: true,
      paymentMethod: true,
      logisticsMethod: true,
      deliveryZone: true,
    },
  });
  for (const reg of registrations) {
    const data: Record<string, string> = {};

    for (const field of ['customerName', 'deliveryAddress'] as const) {
      const next = upper(reg[field]);
      if (next === null) continue;
      data[field] = next;
      note('Registration', reg.id, field, reg[field], next);
    }

    // The coded columns go through their own guards rather than a blind
    // toUpperCase, so an unrecognised value is left alone instead of being
    // promoted to a code the app would then believe.
    const payment = asPaymentMethod(reg.paymentMethod);
    if (payment && payment !== reg.paymentMethod) {
      data.paymentMethod = payment;
      note('Registration', reg.id, 'paymentMethod', reg.paymentMethod, payment);
    }

    const logistics = asLogisticsMethod(reg.logisticsMethod);
    if (logistics !== reg.logisticsMethod) {
      data.logisticsMethod = logistics;
      note('Registration', reg.id, 'logisticsMethod', reg.logisticsMethod, logistics);
    }

    const zone = asDeliveryZone(reg.deliveryZone);
    if (zone !== null && zone !== reg.deliveryZone) {
      data.deliveryZone = zone;
      note('Registration', reg.id, 'deliveryZone', reg.deliveryZone, zone);
    }

    if (WRITE && Object.keys(data).length > 0) {
      await prisma.registration.update({ where: { id: reg.id }, data });
    }
  }

  if (changes.length === 0) {
    console.log('Nothing to change — every row is already uppercase.');
    return;
  }

  console.log(`${WRITE ? 'Updated' : 'Would update'} ${changes.length} value(s):\n`);
  for (const c of changes) {
    console.log(`  ${c.table}.${c.field}  "${c.from}" -> "${c.to}"`);
  }
  if (!WRITE) console.log('\nDry run. Re-run with --write to apply.');
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
