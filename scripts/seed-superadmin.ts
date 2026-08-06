import { hash } from 'bcrypt';
import prisma from '../src/lib/db';

async function main() {
  const superAdminEmail = 'superadmin@stridesync.com';
  
  const existing = await prisma.organizer.findUnique({
    where: { email: superAdminEmail }
  });

  if (existing) {
    console.log('Super Admin already exists.');
    return;
  }

  const hashedPassword = await hash('admin123', 10);

  const superAdmin = await prisma.organizer.create({
    data: {
      email: superAdminEmail,
      password: hashedPassword,
      name: 'System Owner',
      role: 'SUPER_ADMIN',
      status: 'APPROVED',
      adminFee: 0 // Super admin doesn't pay admin fees
    }
  });

  console.log('Super Admin account created successfully:');
  console.log(`Email: ${superAdmin.email}`);
  console.log(`Password: admin123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
