import "dotenv/config";
import bcrypt from 'bcryptjs';
import prisma from '../src/lib/db';
import { toCentavos } from '../src/lib/money';
import { REGISTRATION_FORMS } from '../src/lib/registration-form';
import { EVENT_TYPES, type EventType } from '../src/lib/event-type';
import {
  COMMUNITY_STATUS,
  SEED_RUNNING_COMMUNITIES,
  communitySlug,
} from '../src/lib/running-community';

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

interface SeedCategory {
  id: string;
  name: string;
  /** Empty for a fun-run package, which has no distance. */
  distance: string;
  pricePesos: number;
  /** Inclusions poster. Races have none. */
  imageUrl?: string;
  /**
   * What this option includes. Deliberately not identical across every event:
   * the event page collapses to a single list when all options match and groups
   * by option when they differ, and only seeded data exercises both.
   */
  inclusions?: string[];
}

interface SeedEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  logisticsPickup: boolean;
  deliveryInsidePesos: number;
  deliveryOutsidePesos: number;
  adminFeePesos: number;
  registrationForm: string;
  eventType: EventType;
  categories: SeedCategory[];
}

const events: SeedEvent[] = [
  {
    id: 'seed-crc-event-fun-run',
    title: 'Cresendo Fun Run 2026',
    date: inDays(30),
    startTime: '05:00',
    endTime: '09:00',
    location: 'BGC, Taguig City',
    description: 'A community fun run open to all ages. Race kit includes singlet, bib and finisher medal.',
    logisticsPickup: true,
    // Both tiers offered, so the wizard has to ask the runner which one applies.
    deliveryInsidePesos: 150,
    deliveryOutsidePesos: 250,
    adminFeePesos: 60,
    registrationForm: REGISTRATION_FORMS.ONLINE,
    eventType: EVENT_TYPES.RACE,
    categories: [
      // Different lists per distance, so the event page has to group them.
      {
        id: 'seed-crc-fun-3k',
        name: '3K',
        distance: '3K',
        pricePesos: 500,
        inclusions: ['Race Singlet', 'Race Bib'],
      },
      {
        id: 'seed-crc-fun-5k',
        name: '5K',
        distance: '5K',
        pricePesos: 750,
        inclusions: ['Race Singlet', 'Finisher Medal', 'Race Bib'],
      },
      {
        id: 'seed-crc-fun-10k',
        name: '10K',
        distance: '10K',
        pricePesos: 1000,
        inclusions: [
          'Race Singlet',
          'Finisher Medal',
          'Race Bib with Timing Chip',
          'Sponsor Lootbag',
        ],
      },
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
    // Only one tier priced, so the wizard picks it without asking.
    deliveryInsidePesos: 200,
    deliveryOutsidePesos: 0,
    adminFeePesos: 60,
    registrationForm: REGISTRATION_FORMS.ONLINE,
    eventType: EVENT_TYPES.RACE,
    categories: [
      {
        id: 'seed-crc-hm-10k',
        name: '10K',
        distance: '10K',
        pricePesos: 1200,
        inclusions: ['Singlet', 'Medal'],
      },
      {
        id: 'seed-crc-hm-21k',
        name: '21K',
        distance: '21K',
        pricePesos: 1800,
        inclusions: ['Singlet', 'Medal', 'Finisher Shirt'],
      },
    ],
  },
  {
    // The bank-transfer-only path needs an event of its own to test against —
    // the choice is per event, so no amount of clicking reaches it otherwise.
    id: 'seed-crc-event-trail-run',
    title: 'Cresendo Trail Run',
    date: inDays(50),
    startTime: '05:30',
    endTime: '11:00',
    location: 'Rizal Province',
    description: 'Off-road course through the Sierra Madre foothills. Bank transfer only.',
    logisticsPickup: true,
    deliveryInsidePesos: 180,
    deliveryOutsidePesos: 300,
    // A non-default fee, so a wrong hardcoded ₱60 shows up immediately in the
    // wizard's order summary.
    adminFeePesos: 75,
    registrationForm: REGISTRATION_FORMS.BANK_TRANSFER,
    eventType: EVENT_TYPES.RACE,
    categories: [
      // Identical lists, which is what collapses the event page's inclusions
      // into one ungrouped block. The other seeded races cover the split.
      {
        id: 'seed-crc-trail-11k',
        name: '11K',
        distance: '11K',
        pricePesos: 1400,
        inclusions: ['Trail Singlet', 'Finisher Medal', 'Hydration Flask'],
      },
      {
        id: 'seed-crc-trail-22k',
        name: '22K',
        distance: '22K',
        pricePesos: 2000,
        inclusions: ['Trail Singlet', 'Finisher Medal', 'Hydration Flask'],
      },
    ],
  },
  {
    // A charity run: no distances, so the wizard has to offer packages instead.
    // Without one of these seeded, the fun-run path is only reachable by first
    // creating an event through the admin forms.
    id: 'seed-crc-event-charity-run',
    title: 'Cresendo Charity Run 2026',
    date: inDays(65),
    startTime: '06:00',
    endTime: '09:00',
    location: 'Marikina Sports Center',
    description: 'One route, run it at your own pace. Proceeds go to the community scholarship fund.',
    logisticsPickup: true,
    deliveryInsidePesos: 150,
    deliveryOutsidePesos: 250,
    adminFeePesos: 60,
    registrationForm: REGISTRATION_FORMS.ONLINE,
    eventType: EVENT_TYPES.FUN_RUN,
    categories: [
      {
        id: 'seed-crc-charity-basic',
        name: 'Basic Package',
        distance: '',
        pricePesos: 199,
        imageUrl: image('seed-crc-charity-basic'),
        inclusions: [
          'Registration Band',
          'Raffle Entry',
          'Snacks',
          'Event Entitlement',
        ],
      },
      {
        id: 'seed-crc-charity-full',
        name: 'Full Package',
        distance: '',
        pricePesos: 699,
        imageUrl: image('seed-crc-charity-full'),
        inclusions: [
          'Registration Band',
          'Limited Edition Shirt',
          'Raffle Entry',
          'Snacks',
          'Event Entitlement',
        ],
      },
    ],
  },
];

async function main() {
  const password = await bcrypt.hash(PASSWORD, 10);

  // The shared club list. The migration seeds these too, so this only matters
  // after `prisma migrate reset` on a branch where that migration has already
  // run — but without them the registration form has nothing to suggest.
  await prisma.runningCommunity.createMany({
    data: SEED_RUNNING_COMMUNITIES.map(name => ({
      name,
      slug: communitySlug(name),
      status: COMMUNITY_STATUS.APPROVED,
    })),
    skipDuplicates: true,
  });
  console.log(`Running communities: ${SEED_RUNNING_COMMUNITIES.length} seeded`);

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

  for (const {
    categories,
    deliveryInsidePesos,
    deliveryOutsidePesos,
    adminFeePesos,
    ...event
  } of events) {
    // Pesos here, centavos in the database — the same direction every form and
    // API route converts in.
    const pricing = {
      logisticsDeliveryFeeInside: toCentavos(deliveryInsidePesos),
      logisticsDeliveryFeeOutside: toCentavos(deliveryOutsidePesos),
      adminFee: toCentavos(adminFeePesos),
      registrationForm: event.registrationForm,
      eventType: event.eventType,
    };

    await prisma.event.upsert({
      where: { id: event.id },
      // Re-running after a pricing change should actually re-price the seeded
      // events. Everything else the script leaves alone.
      update: pricing,
      create: {
        ...event,
        ...pricing,
        imageUrl: image(event.id),
        organizerId: organizer.id,
      },
    });

    for (const c of categories) {
      await prisma.category.upsert({
        where: { id: c.id },
        // Inclusions join price in the update so re-seeding heals rows created
        // before this column existed, which is every seeded row today.
        update: { price: toCentavos(c.pricePesos), inclusions: c.inclusions ?? [] },
        create: {
          id: c.id,
          name: c.name,
          distance: c.distance,
          price: toCentavos(c.pricePesos),
          imageUrl: c.imageUrl ?? null,
          inclusions: c.inclusions ?? [],
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
