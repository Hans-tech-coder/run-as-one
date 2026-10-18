import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { revalidateTag } from 'next/cache';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy it from the Neon dashboard into .env (local) or the Vercel project settings (deployed).'
  );
}

/**
 * The tag every cached public read carries (lib/public-db.ts).
 *
 * Lives here rather than in public-db.ts because this client is what expires
 * it: any write anywhere in the app clears every cached public read, so a
 * published event, a new registration taking a slot or an uploaded result is
 * on the next page anyone opens. Clearing on every write instead of on the
 * writes that matter is deliberate — a write means Neon is already awake, so
 * the reads it costs to warm the cache again are nearly free, and no route can
 * forget to clear it.
 */
export const PUBLIC_DATA_TAG = 'public-data';

const MUTATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

function expirePublicData() {
  try {
    revalidateTag(PUBLIC_DATA_TAG, { expire: 0 });
  } catch {
    // Outside a route handler or server action — a script, a seed, a write
    // during render — there is no Next cache to clear. The cached reads still
    // expire on their own (SAFETY_NET_SECONDS in lib/public-db.ts).
  }
}

const prismaClientSingleton = () => {
  // Pooled connection (PgBouncer). Migrations use DIRECT_URL instead — see prisma.config.ts.
  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({ adapter }).$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          const result = await query(args);
          if (MUTATIONS.has(operation)) expirePublicData();
          return result;
        },
      },
      async $executeRaw({ args, query }) {
        const result = await query(args);
        expirePublicData();
        return result;
      },
      async $executeRawUnsafe({ args, query }) {
        const result = await query(args);
        expirePublicData();
        return result;
      },
    },
  });
  // A query extension changes what runs, not the client's shape, so callers
  // keep the plain PrismaClient type (and Prisma.TransactionClient for `tx`).
  return client as unknown as PrismaClient;
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
