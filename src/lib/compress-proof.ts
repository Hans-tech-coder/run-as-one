/**
 * **A payment screenshot is shrunk in the browser before it is uploaded**
 * (CATEGORY_CHANGE_PLAN.md Session 3, the proof staff attach when they record
 * an upgrade's GCash or bank payment).
 *
 * A phone screenshot is often 2–4 MB of PNG, close to the 4 MB upload limit
 * (`uploads.ts`) and to Vercel's request size, and every byte of it sits in the
 * private Blob store for good. A receipt only has to stay readable: redrawn at
 * most `MAX_EDGE` pixels on its long side as a JPEG, it is typically a tenth of
 * the size with every reference number still legible.
 *
 * Browser-only (canvas). A PDF, a file the browser cannot draw, or a result no
 * smaller than the original is sent as it was — compression is a saving, never
 * a reason to refuse a proof; the server checks type and size either way.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

export async function compressProof(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    // JPEG has no transparency; a screenshot's clear corners would turn black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') || 'proof';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
