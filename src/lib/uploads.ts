/**
 * What the app accepts from a file picker — the one list both sides read.
 *
 * This used to live only in `blob.ts`, which is a server module (it imports
 * the Blob SDK), so every `accept="..."` on a file input was a hand-written
 * copy of it. The copies drifted: both registration wizards offered
 * `application/pdf` for a deposit slip while the server allowed images only,
 * so a runner who picked the PDF receipt their bank emailed them was refused
 * by `/api/checkout/manual` at the very end of checkout, with the whole form
 * already filled in.
 *
 * Nothing here imports the Blob SDK, so a client component can import it too.
 * `blob.ts` enforces these rules on the way in; the inputs advertise exactly
 * the same list on the way out.
 */

/**
 * 4 MB. Files are uploaded through our own route, and a Vercel function's
 * request body is capped at 4.5 MB — anything above that is rejected by the
 * platform before our code runs, with a much less helpful error. A phone photo
 * of a GCash receipt and an event banner both fit comfortably under this.
 *
 * If large certificate templates ever need to go through, the fix is a client
 * upload (browser straight to blob storage), not a bigger number here.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** The same cap, in the unit the hint under a drop zone says out loud. */
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / 1024 / 1024;

export const PDF_TYPE = 'application/pdf';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/**
 * What each kind of upload accepts.
 *
 * `template` allows PDF because `ECertificateGenerator` loads the template
 * with `PDFDocument.load()` first and only falls back to embedding it as an
 * image. `proof` allows PDF because that is what a bank emails: BPI, BDO and
 * Landbank all send a PDF confirmation, and a runner should not have to
 * screenshot one to register.
 */
const ALLOWED_TYPES = {
  image: [...IMAGE_TYPES],
  template: [...IMAGE_TYPES, PDF_TYPE],
  proof: [...IMAGE_TYPES, PDF_TYPE],
} as const;

export type UploadKind = keyof typeof ALLOWED_TYPES;

export function allowedTypes(kind: UploadKind): readonly string[] {
  return ALLOWED_TYPES[kind];
}

/**
 * The `accept` attribute for a file input of this kind. Built from the list
 * above rather than typed out beside the input, which is the whole point:
 * what the picker offers and what the server takes cannot disagree again.
 */
export function acceptAttribute(kind: UploadKind): string {
  return ALLOWED_TYPES[kind].join(', ');
}

/**
 * How a type is written for a person — "JPG", not "image/jpeg". JPEG is
 * spelled JPG because that is what the file on their phone is called.
 */
const READABLE_TYPES: Record<string, string> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'image/gif': 'GIF',
  [PDF_TYPE]: 'PDF',
};

function readable(type: string): string {
  return READABLE_TYPES[type] ?? type.split('/')[1]?.toUpperCase() ?? type;
}

/** "JPG, PNG, WEBP, GIF, PDF" — for the rejection message on the server. */
export function listUploadTypes(kind: UploadKind): string {
  return ALLOWED_TYPES[kind].map(readable).join(', ');
}

/** "JPG, PNG, WEBP, GIF or PDF" — for the hint a runner reads before choosing. */
export function describeUploadTypes(kind: UploadKind): string {
  const names = ALLOWED_TYPES[kind].map(readable);
  const last = names[names.length - 1];
  return `${names.slice(0, -1).join(', ')} or ${last}`;
}

/**
 * The extension a stored file gets, decided by its type rather than by
 * whatever the phone called it. See `uploadPrivateProof` — the admin viewer
 * reads the stored pathname to know whether to draw an `<img>` or a PDF
 * frame, so an unnamed or misnamed receipt must not be able to lie about it.
 */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  [PDF_TYPE]: 'pdf',
};

export function extensionForType(type: string): string {
  return EXTENSIONS[type] ?? 'bin';
}

/**
 * Whether a stored proof is a PDF rather than a picture. Takes the pathname
 * kept in `Registration.proofOfPayment`, whose extension is set from the
 * uploaded content type by `uploadPrivateProof`.
 *
 * Every proof uploaded before PDFs were accepted is an image, and those
 * pathnames carry the extension of the file the runner picked — so an old row
 * answers this correctly too.
 */
export function isPdfProof(pathname: string | null | undefined): boolean {
  return !!pathname && pathname.toLowerCase().endsWith('.pdf');
}
