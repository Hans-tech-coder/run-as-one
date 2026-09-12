import { put, issueSignedToken, presignUrl } from '@vercel/blob';
import {
  MAX_UPLOAD_BYTES,
  allowedTypes,
  extensionForType,
  listUploadTypes,
  type UploadKind,
} from './uploads';

/**
 * All file uploads go through this module. Nothing in the app writes to the
 * local filesystem: Vercel runs on a read-only disk, so a `writeFile` that
 * works in `next dev` would 500 in production.
 *
 * *What* may be uploaded lives in `uploads.ts` instead of here, because the
 * file inputs have to advertise the same list and a client component cannot
 * import this file — it pulls in the Blob SDK.
 */

export { MAX_UPLOAD_BYTES };
export type { UploadKind };

/** Bad input from the caller. Routes turn this into a 400, not a 500. */
export class UploadError extends Error {}

/**
 * There are two stores, not one: a Blob store's access level is fixed when the
 * store is created (it is a required field on `vercel blob create-store` and on
 * the REST API), so a single store cannot hold both public and private blobs.
 * Event imagery lives in the public store, payment receipts in the private one,
 * and each store has its own token.
 *
 * The public store uses the SDK's default env var name. The private one is
 * prefixed, which is what Vercel produces when you connect a second Blob store
 * to a project and give it the prefix PROOFS_.
 */
const TOKEN_ENV = {
  public: 'BLOB_READ_WRITE_TOKEN',
  private: 'PROOFS_BLOB_READ_WRITE_TOKEN',
} as const;

/** Exported for scripts/test-blob.ts, which needs both tokens to clean up after itself. */
export function storeToken(store: keyof typeof TOKEN_ENV): string {
  const envVar = TOKEN_ENV[store];
  const token = process.env[envVar];

  if (!token) {
    throw new Error(
      `${envVar} is not set. Create a Blob store with ${store} access in the Vercel ` +
        `dashboard (Storage → Create Database → Blob), then copy its token into .env ` +
        `as ${envVar} (local) or the Vercel project settings (deployed).`
    );
  }

  return token;
}

/**
 * Validates an untrusted `formData.get(...)` value. Note that `file.type` is
 * supplied by the client and can be spoofed — it is a usability guard, not a
 * security boundary. The real protections are the size cap, the fact that
 * uploads land on a separate blob domain (never executed by our app), and the
 * auth checks in the routes.
 */
export function assertUploadable(file: unknown, kind: UploadKind = 'image'): asserts file is File {
  const allowed = allowedTypes(kind);

  if (!(file instanceof File) || file.size === 0) {
    throw new UploadError('No file was uploaded.');
  }
  if (!allowed.includes(file.type)) {
    throw new UploadError(
      `Unsupported file type "${file.type || 'unknown'}". Allowed: ${listUploadTypes(kind)}.`
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new UploadError(
      `File is too large (${mb} MB). The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`
    );
  }
}

/**
 * Event banners, race kit photos and certificate templates. These are shown to
 * the public on the events pages, so they are public blobs served by the CDN.
 * Returns the full URL, which is what goes in the database.
 */
export async function uploadPublicFile(
  file: unknown,
  folder: string,
  kind: UploadKind = 'image'
): Promise<string> {
  assertUploadable(file, kind);

  const blob = await put(`${folder}/${file.name}`, file, {
    access: 'public',
    addRandomSuffix: true,
    contentType: file.type,
    token: storeToken('public'),
  });

  return blob.url;
}

/**
 * Turns whatever the phone called the file into a name we can trust.
 *
 * Two things matter. The extension is taken from the content type, not from
 * the name — the admin viewer reads the stored pathname to decide between an
 * `<img>` and a PDF frame, and a receipt saved as `slip` or `slip.jpg` by a
 * banking app that then hands over a PDF would otherwise be drawn as a broken
 * image. And any directory part is dropped, so a crafted name cannot scatter
 * files around the private store.
 */
function proofFileName(file: File): string {
  const base =
    file.name.split(/[\\/]/).pop()?.replace(/\.[^.]*$/, '').trim() || 'proof';

  return `${base}.${extensionForType(file.type)}`;
}

/**
 * Proof of payment. These are screenshots of bank and e-wallet receipts, or
 * the PDF confirmation a bank emails — names, amounts, reference numbers — so
 * they are private blobs, readable only through a short-lived signed URL.
 * Returns the pathname, not a URL, because a private blob has no permanently
 * valid address; see signedProofUrl().
 */
export async function uploadPrivateProof(file: unknown): Promise<string> {
  assertUploadable(file, 'proof');

  const blob = await put(`proofs/${proofFileName(file)}`, file, {
    access: 'private',
    addRandomSuffix: true,
    contentType: file.type,
    token: storeToken('private'),
  });

  return blob.pathname;
}

/**
 * Mints a short-lived URL for one private proof. Called per view, so the token
 * is not cached — if proof viewing ever becomes hot enough to matter, cache the
 * issueSignedToken() result and reuse it until it nears expiry.
 */
export async function signedProofUrl(pathname: string, ttlMs = 5 * 60 * 1000): Promise<string> {
  const validUntil = Date.now() + ttlMs;

  const token = await issueSignedToken({
    pathname,
    operations: ['get'],
    validUntil,
    token: storeToken('private'),
  });

  const { presignedUrl } = await presignUrl(token, {
    operation: 'get',
    pathname,
    access: 'private',
    validUntil,
  });

  return presignedUrl;
}
