import "dotenv/config";
import bcrypt from 'bcryptjs';
import prisma from '../src/lib/db';

async function main() {
  console.log('Seeding database...');

  const hashedPassword = await bcrypt.hash('admin123', 10);

  const testOrganizer = await prisma.organizer.upsert({
    where: { email: 'admin@runasone.com' },
    update: {},
    create: {
      email: 'admin@runasone.com',
      name: 'Super Admin Test',
      password: hashedPassword,
      status: 'APPROVED',
    },
  });

  console.log('Test organizer created:', testOrganizer);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
