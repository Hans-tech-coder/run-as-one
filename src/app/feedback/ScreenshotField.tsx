"use client";

import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import BusyLabel from "@/components/ui/BusyLabel";
import { useImageCompression } from "@/lib/image-compress";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  acceptAttribute,
  allowedTypes,
  describeUploadTypes,
} from "@/lib/uploads";

/**
 * The optional screenshot on the feedback form.
 *
 * "The button did nothing" is a sentence; the same sentence with a picture of
 * the screen is a bug somebody can find. So a sender may attach one image —
 * images only, because the point is what they saw, and the same 4 MB cap every
 * upload on the site has.
 *
 * The drop zone copies the deposit-slip picker in the registration wizard, so
 * a runner meets one file control on this site rather than two. Once a file is
 * chosen the zone becomes a preview of it: the sender can see they attached
 * the right screenshot, not just a file name. On Paper the zone is `.site-drop`
 * (site.css): a dashed field edge on the card, blue while a file is dragged
 * over it, red while a refused pick is the error.
 */

/** What is wrong with a picked file, or null when it can go. The route checks
 *  the same rules; this is so the common mistake never costs a round trip. */
export function screenshotProblem(file: File): string | null {
  if (!allowedTypes("image").includes(file.type)) {
    return `The screenshot must be a ${describeUploadTypes("image")} image.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_MB} MB.`;
  }
  return null;
}

export default function ScreenshotField({
  id,
  file,
  error,
  onChange,
  onBusyChange,
}: {
  id: string;
  file: File | null;
  error?: string;
  /** A file that passed screenshotProblem, or null when it was removed; a
   *  refused pick arrives as the message to show instead. */
  onChange: (next: { file: File | null; error?: string }) => void;
  /** True while a picked image is being shrunk, so the form holds Send. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  // The preview remembers which file it was drawn from, so a picture of the
  // previous pick never shows beside the next one's name while it loads. Read
  // as a data URL rather than an object URL: nothing to revoke, and the state
  // is set from the reader's callback rather than synchronously in the effect.
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPreview({ file, url: reader.result });
    };
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  const previewUrl = preview && preview.file === file ? preview.url : null;

  // Shrunk before the size check (image-compress.ts), so a phone's 6 MB
  // screenshot is judged by what will actually be sent.
  const { optimizing, compress } = useImageCompression("proof");

  const pick = async (dropped: File | undefined) => {
    if (!dropped) return;
    onBusyChange?.(true);
    const picked = await compress(dropped);
    // A newer pick took over while this one was drawn; it reports for itself.
    if (!picked) return;
    onBusyChange?.(false);
    const problem = screenshotProblem(picked);
    if (problem) {
      if (inputRef.current) inputRef.current.value = "";
      onChange({ file: null, error: problem });
      return;
    }
    onChange({ file: picked });
  };

  const clear = () => {
    if (inputRef.current) inputRef.current.value = "";
    onChange({ file: null });
  };

  return (
    <div className="input-group">
      <label htmlFor={id}>
        Screenshot <span className="font-normal text-site-muted">(Optional)</span>
      </label>

      {file ? (
        <div className="flex items-center gap-4 rounded-[12px] border border-site-line bg-site-surface p-3">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local data URL; next/image cannot optimise it
            <img
              src={previewUrl}
              alt="The screenshot you attached"
              className="h-20 w-20 shrink-0 rounded-[10px] border border-site-line bg-site-card object-cover sm:h-24 sm:w-24"
            />
          ) : (
            <div
              aria-hidden="true"
              className="h-20 w-20 shrink-0 rounded-[10px] border border-site-line bg-site-card sm:h-24 sm:w-24"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-site-ink" title={file.name}>
              {file.name}
            </div>
            <div className="text-xs text-site-muted">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
          <button
            type="button"
            onClick={clear}
            aria-label="Remove screenshot"
            className="site-icon-btn shrink-0"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div
          className="site-drop"
          data-dragging={isDragging}
          data-invalid={!!error}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
        >
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={acceptAttribute("image")}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${error ? `${id}-error ` : ""}${id}-hint`}
            className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <div className="relative z-10 flex flex-col items-center gap-1">
            <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-site-surface text-site-ink">
              <ImagePlus size={20} aria-hidden="true" />
            </div>
            <div className="text-[0.9375rem] font-semibold text-site-ink">
              Attach a Screenshot of What You Saw
            </div>
            <div className="text-sm text-site-muted">
              Drag it here, or tap to choose one from your device
            </div>
          </div>
        </div>
      )}

      {optimizing && (
        <p role="status" className="m-0 text-sm text-site-muted">
          <BusyLabel>Optimizing Image</BusyLabel>
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
      <p id={`${id}-hint`} className="m-0 text-xs text-site-muted">
        {describeUploadTypes("image")}, up to {MAX_UPLOAD_MB} MB. Only the Run As One
        team sees it.
      </p>
    </div>
  );
}
