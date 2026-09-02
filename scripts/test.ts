import "dotenv/config";
import prisma from '../src/lib/db';

/** Connectivity smoke test — confirms the app can reach Neon and read a table. */
async function main() {
  const url = process.env.DATABASE_URL ?? '';
  // Never print the password.
  console.log('Host:', url.replace(/^.*@/, '').split('/')[0] || '(DATABASE_URL not set)');

  try {
    await prisma.$connect();
    console.log('Connected.');

    const [organizers, events, registrations] = await Promise.all([
      prisma.organizer.count(),
      prisma.event.count(),
      prisma.registration.count(),
    ]);

    console.log('Row counts:', { organizers, events, registrations });
  } catch (e) {
    console.error('Error:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
