"use client";

import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
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
 * the right screenshot, not just a file name.
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
}: {
  id: string;
  file: File | null;
  error?: string;
  /** A file that passed screenshotProblem, or null when it was removed; a
   *  refused pick arrives as the message to show instead. */
  onChange: (next: { file: File | null; error?: string }) => void;
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

  const pick = (picked: File | undefined) => {
    if (!picked) return;
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
        Screenshot <span className="text-secondary/70">(optional)</span>
      </label>

      {file ? (
        <div className="flex items-center gap-4 rounded-[16px] border border-white/10 bg-white/5 p-3">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local data URL; next/image cannot optimise it
            <img
              src={previewUrl}
              alt="The screenshot you attached"
              className="h-20 w-20 shrink-0 rounded-[12px] border border-white/10 bg-black/40 object-cover sm:h-24 sm:w-24"
            />
          ) : (
            <div
              aria-hidden="true"
              className="h-20 w-20 shrink-0 rounded-[12px] border border-white/10 bg-black/40 sm:h-24 sm:w-24"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-white" title={file.name}>
              {file.name}
            </div>
            <div className="text-xs text-secondary">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
          <button
            type="button"
            onClick={clear}
            aria-label="Remove screenshot"
            className="shrink-0 rounded-full bg-black/40 p-2 text-secondary transition-all hover:bg-red-500/10 hover:text-red-400"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div
          className={`relative cursor-pointer overflow-hidden rounded-[16px] border-2 border-dashed p-5 text-center transition-all ${
            isDragging
              ? "border-accent-blue bg-accent-blue/10"
              : error
                ? "border-red-500/60 bg-red-500/[0.06]"
                : "border-white/20 bg-black/20 hover:border-white/40 hover:bg-white/5"
          }`}
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
            <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
              <ImagePlus size={22} className="text-accent-blue" aria-hidden="true" />
            </div>
            <div className="text-[0.95rem] font-bold text-white">
              Attach a screenshot of what you saw
            </div>
            <div className="text-xs text-secondary">
              Drag it here, or tap to choose one from your device
            </div>
          </div>
        </div>
      )}

      <FieldError id={`${id}-error`} message={error} />
      <p id={`${id}-hint`} className="m-0 text-xs text-secondary">
        {describeUploadTypes("image")}, up to {MAX_UPLOAD_MB} MB. Only the Run As One
        team sees it.
      </p>
    </div>
  );
}
