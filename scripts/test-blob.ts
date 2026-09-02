import "dotenv/config";
import { del } from '@vercel/blob';
import { uploadPublicFile, uploadPrivateProof, signedProofUrl, storeToken } from '../src/lib/blob';

/**
 * Round-trips one file through each Blob store and reads it back.
 *
 * The failure this exists to catch is the two tokens being swapped: uploads
 * still succeed, but receipts land in the public store where anyone with the
 * URL can read them. So this checks the store each file actually landed in,
 * not just that the upload returned without throwing.
 *
 * Run: npm run test:blob
 */

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function testFile(name: string) {
  return new File([new Uint8Array(PNG_1PX)], name, { type: 'image/png' });
}

async function main() {
  let failures = 0;

  const fail = (msg: string) => {
    console.error(`  FAIL: ${msg}`);
    failures++;
  };

  // Filled in as each upload succeeds, so cleanup() below can delete whatever
  // actually made it into a store even if a later check throws.
  let publicUrl: string | undefined;
  let proofPath: string | undefined;

  async function cleanup() {
    // Test files are junk. Left behind, every run of this script would add two
    // more — and a stray blob-check.png in the events folder looks like real
    // event imagery to anyone browsing the store later.
    try {
      if (publicUrl) await del(publicUrl, { token: storeToken('public') });
      if (proofPath) await del(proofPath, { token: storeToken('private') });
      console.log('\nTest files deleted from both stores.');
    } catch (err: any) {
      // Not a test failure — the checks above already ran. Just say so, so the
      // leftovers can be removed by hand.
      console.warn(`\nCould not delete the test files: ${err.message}`);
    }
  }

  console.log('\n1. Public store (event images)');
  publicUrl = await uploadPublicFile(testFile('blob-check.png'), 'events');
  console.log(`   uploaded -> ${publicUrl}`);

  if (!publicUrl.includes('.public.blob.vercel-storage.com')) {
    fail(`expected a public store URL, got ${publicUrl}`);
  }

  // A public blob must be readable with no credentials at all.
  const publicRes = await fetch(publicUrl);
  if (publicRes.ok) {
    console.log(`   readable without auth (${publicRes.status}) — correct for event images`);
  } else {
    fail(`public blob was not readable: ${publicRes.status}`);
  }

  console.log('\n2. Private store (payment receipts)');
  proofPath = await uploadPrivateProof(testFile('proof-check.png'));
  console.log(`   uploaded -> pathname "${proofPath}"`);

  // The signed URL proves the blob is in the private store AND that the
  // proofs token can read it back.
  const signed = await signedProofUrl(proofPath, 60 * 1000);
  const host = new URL(signed).host;
  console.log(`   signed URL host: ${host}`);

  if (!host.endsWith('.private.blob.vercel-storage.com')) {
    fail(`receipts are NOT in a private store (host ${host}). Check whether the two tokens in .env are swapped.`);
  }

  const signedRes = await fetch(signed);
  if (signedRes.ok) {
    console.log(`   readable with a signed URL (${signedRes.status})`);
  } else {
    fail(`signed URL did not work: ${signedRes.status}`);
  }

  // Same blob, no signature: must be refused.
  const unsigned = await fetch(`https://${host}${proofPath.startsWith('/') ? '' : '/'}${proofPath}`);
  if (unsigned.ok) {
    fail(`a receipt was readable WITHOUT a signature (${unsigned.status}) — it is not actually private`);
  } else {
    console.log(`   refused without a signature (${unsigned.status}) — correct for receipts`);
  }

  await cleanup();

  console.log(
    failures === 0
      ? '\nAll checks passed. Both stores are wired to the right token.\n'
      : `\n${failures} check(s) failed.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
