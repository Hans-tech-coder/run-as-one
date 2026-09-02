import "dotenv/config";
import bcrypt from 'bcryptjs';
import prisma from '../src/lib/db';
import { toCentavos } from '../src/lib/money';

/**
 * Development data: one organizer plus the events used for manual testing.
 *
 * This exists because `prisma migrate dev` resets the database whenever it has
 * to rebuild a migration, and hand-made test accounts and events go with it.
 * Re-running this script is faster and less annoying than clicking through the
 * admin forms again.
 *
 * Every row has a fixed id, so running this twice updates rather than
 * duplicates. It never deletes anything it did not create.
 *
 * Run: npm run seed:dev
 */

const ORGANIZER_ID = 'seed-crc-organizer';
const PASSWORD = 'crc123';

/**
 * Placeholder imagery. `imageUrl` is a required column and every event page
 * renders it, so a seeded event without one looks broken. These are plain <img>
 * tags (the app uses no next/image), so any host works without config.
 */
const image = (seed: string) => `https://picsum.photos/seed/${seed}/1200/600`;

/** Dates are stored as the "YYYY-MM-DD" string an <input type="date"> produces. */
function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const events = [
  {
    id: 'seed-crc-event-fun-run',
    title: 'Cresendo Fun Run 2026',
    date: inDays(30),
    startTime: '05:00',
    endTime: '09:00',
    location: 'BGC, Taguig City',
    description: 'A community fun run open to all ages. Race kit includes singlet, bib and finisher medal.',
    logisticsPickup: true,
    logisticsDeliveryFeePesos: 150,
    categories: [
      { id: 'seed-crc-fun-3k', name: '3K', distance: '3K', pricePesos: 500 },
      { id: 'seed-crc-fun-5k', name: '5K', distance: '5K', pricePesos: 750 },
      { id: 'seed-crc-fun-10k', name: '10K', distance: '10K', pricePesos: 1000 },
    ],
  },
  {
    id: 'seed-crc-event-half-marathon',
    title: 'Cresendo Half Marathon',
    date: inDays(75),
    startTime: '04:00',
    endTime: '10:00',
    location: 'Clark Freeport Zone, Pampanga',
    description: 'Certified course with chip timing. Cut-off is 3 hours for the 21K.',
    logisticsPickup: false,
    logisticsDeliveryFeePesos: 200,
    categories: [
      { id: 'seed-crc-hm-10k', name: '10K', distance: '10K', pricePesos: 1200 },
      { id: 'seed-crc-hm-21k', name: '21K', distance: '21K', pricePesos: 1800 },
    ],
  },
];

async function main() {
  const password = await bcrypt.hash(PASSWORD, 10);

  const organizer = await prisma.organizer.upsert({
    where: { id: ORGANIZER_ID },
    update: { password, status: 'APPROVED' },
    create: {
      id: ORGANIZER_ID,
      email: 'crc@gmail.com',
      password,
      name: 'Cresendo Running Community',
      role: 'ORGANIZER',
      status: 'APPROVED',
      // ₱60.00 per registrant, the schema default. Spelled out here so the
      // seeded organizer does not silently change if that default moves.
      adminFee: toCentavos(60),
    },
  });

  for (const { categories, logisticsDeliveryFeePesos, ...event } of events) {
    await prisma.event.upsert({
      where: { id: event.id },
      update: {},
      create: {
        ...event,
        imageUrl: image(event.id),
        logisticsDeliveryFee: toCentavos(logisticsDeliveryFeePesos),
        organizerId: organizer.id,
      },
    });

    for (const c of categories) {
      await prisma.category.upsert({
        where: { id: c.id },
        update: { price: toCentavos(c.pricePesos) },
        create: {
          id: c.id,
          name: c.name,
          distance: c.distance,
          price: toCentavos(c.pricePesos),
          eventId: event.id,
        },
      });
    }

    console.log(`Event: ${event.title} (${categories.length} categories)`);
  }

  console.log(`\nOrganizer: ${organizer.email} / ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
