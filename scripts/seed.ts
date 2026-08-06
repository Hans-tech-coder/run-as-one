import "dotenv/config";
import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import bcrypt from 'bcrypt';

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');
  
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  const testOrganizer = await prisma.organizer.upsert({
    where: { email: 'admin@stridesync.com' },
    update: {},
    create: {
      email: 'admin@stridesync.com',
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
