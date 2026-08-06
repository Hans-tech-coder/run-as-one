import "dotenv/config";
import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

async function main() {
  console.log("process.env.DATABASE_URL:", process.env.DATABASE_URL);

  try {
    const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
    console.log("Adapter initialized");
    
    const prisma = new PrismaClient({ adapter });
    console.log("Prisma initialized");
    
    await prisma.$connect();
    console.log("Connected!");
    
    const count = await prisma.organizer.count();
    console.log("Count:", count);
    
  } catch (e) {
    console.error("Error:", e);
  }
}
main();
