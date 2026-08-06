import prisma from '../src/lib/db';

async function main() {
  const organizers = await prisma.organizer.findMany();
  console.log('All Organizers:', organizers);
}

main().catch(console.error).finally(() => prisma.$disconnect());
