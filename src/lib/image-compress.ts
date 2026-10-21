/**
 * **Compression can only ever help.** A picked image is shrunk in the browser
 * before it is uploaded (IMAGE_COMPRESSION_PLAN.md C1–C4), and this hands back
 * the original file whenever it cannot do better — not an image it should
 * touch, a browser that cannot decode it, an encoder that throws, or a result
 * no smaller than what the person picked. A caller therefore never has to
 * handle a failure: it uploads whatever comes back, and the server's own
 * `assertUploadable` (`blob.ts`) stays the real guard on type and size.
 *
 * Why the browser and not the server (C1): a Vercel function refuses a body
 * over ~4.5 MB before our code runs, so a straight-from-camera photo has to
 * shrink before it is sent; a phone on mobile data sends less; and the server
 * needs no `sharp`. Blob storage and its monthly operation cap are the budget
 * this protects — on Hobby, going over locks Blob for 30 days, and payment
 * proofs were 85% of what was stored when this was measured.
 *
 * Presets are by purpose, not by file (C3), so the text in a receipt stays
 * legible and a QR code stays scannable:
 *
 * - `proof` — payment proofs, remittance receipts, feedback screenshots.
 *   2000 px, JPEG 0.82. A 1080×2400 phone screenshot is barely scaled; most of
 *   the saving is PNG becoming JPEG, so every reference number stays sharp.
 * - `photo` — event covers, highlights, posters, size charts. 1920 px, JPEG 0.85.
 * - `graphic` — logos, site icons, bank QR codes. 1024 px, **PNG kept**
 *   (transparency; JPEG artifacts can break a QR) — resized only.
 *
 * Certificate templates, PDFs and GIFs are never touched: a template prints at
 * A4 and needs its pixels, a PDF cannot be recompressed cheaply here, and a
 * GIF may be animated. The admin profile photo keeps its own square crop
 * (`SettingsPanels.tsx`), which is not a resize.
 *
 * JPEG, not WebP (C4): Safari's canvas WebP encoding is unreliable on older
 * iPhones, and `pdf-lib` (certificates, printed sheets) cannot embed WebP.
 *
 * Browser-only: `compressImage` checks for `createImageBitmap` and returns the
 * file untouched where there is none, so importing it from shared code cannot
 * break a server render.
 */

import { useCallback, useRef, useState } from 'react';

export type CompressPreset = 'proof' | 'photo' | 'graphic';

interface Preset {
  /** The longest side the result may have. Never scaled up. */
  maxSide: number;
  /** null keeps the picked type (PNG stays PNG); otherwise always JPEG. */
  output: 'image/jpeg' | null;
  quality: number;
}

const PRESETS: Record<CompressPreset, Preset> = {
  proof: { maxSide: 2000, output: 'image/jpeg', quality: 0.82 },
  photo: { maxSide: 1920, output: 'image/jpeg', quality: 0.85 },
  graphic: { maxSide: 1024, output: null, quality: 0.92 },
};

/**
 * The only types worth redrawing. GIF is left out on purpose (it may be
 * animated, and a canvas keeps only the first frame), and so is everything
 * that is not an image.
 */
const COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/webp'];

const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

/**
 * The picked file, made smaller for `preset` when that is possible, otherwise
 * the very same file. Never rejects.
 */
export async function compressImage(file: File, preset: CompressPreset): Promise<File> {
  if (!COMPRESSIBLE.includes(file.type)) return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  const settings = PRESETS[preset];
  let bitmap: ImageBitmap | null = null;
  try {
    // `from-image` applies the photo's EXIF rotation, which is what a phone
    // camera relies on — without it a portrait receipt lands sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const longest = Math.max(bitmap.width, bitmap.height);
    if (!longest) return file;
    const scale = Math.min(1, settings.maxSide / longest);

    // A graphic is only ever resized, so one already small enough is left
    // exactly as it was rather than re-encoded for nothing.
    if (settings.output === null && scale === 1) return file;

    // A WebP graphic is redrawn as PNG: the canvas cannot be trusted to
    // encode WebP everywhere (C4), and PNG keeps its transparency.
    const type = settings.output ?? (file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png');
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    if (type === 'image/jpeg') {
      // JPEG has no transparency, and a canvas left clear encodes its empty
      // pixels as black: a transparent PNG screenshot would arrive as black
      // text on black. White is what the paper behind a receipt would be.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, type, settings.quality),
    );
    if (!blob || blob.size === 0 || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]*$/, '') || 'image';
    return new File([blob], `${base}.${EXTENSION[type]}`, {
      type,
      lastModified: file.lastModified,
    });
  } catch {
    // A file the browser cannot decode (a HEIC renamed .jpg, a truncated
    // download) goes up as it is; the server says whether it is acceptable.
    return file;
  } finally {
    bitmap?.close();
  }
}

/**
 * For a field that holds the picked file before it is sent — a preview, a
 * size check on the spot — rather than uploading at once (C5). A large photo
 * takes a moment on a phone, so `optimizing` lets the field say *Optimizing
 * image* instead of looking frozen.
 *
 * `compress` resolves to null when a newer pick arrived while this one was
 * still being drawn, so a slow first file can never land over the second.
 */
export function useImageCompression(preset: CompressPreset) {
  const [optimizing, setOptimizing] = useState(false);
  const latest = useRef(0);

  const compress = useCallback(
    async (file: File): Promise<File | null> => {
      const ticket = ++latest.current;
      setOptimizing(true);
      const result = await compressImage(file, preset);
      if (ticket !== latest.current) return null;
      setOptimizing(false);
      return result;
    },
    [preset],
  );

  return { optimizing, compress };
}
