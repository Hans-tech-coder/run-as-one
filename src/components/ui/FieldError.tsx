"use client";

import React from "react";
import { AlertCircle } from "lucide-react";

/**
 * The reason a control is red, next to that control.
 *
 * Every form in the app — the runner's registration wizard and the organizer's
 * admin screens alike — says what one field wants in the same voice and the
 * same place, so this lives in components/ui rather than beside any one of
 * them. It is deliberately narrower than a summary dialog: the dialog says how
 * much is left and where to start, this says what this one field wants.
 * Rendering nothing for an empty message means callers can pass `errors.email`
 * straight through.
 *
 * The id is what the input points its aria-describedby at, so a screen reader
 * reads the label, the value, and then this — rather than announcing a bare
 * "invalid entry" with no way to find out why.
 */
export default function FieldError({
  id,
  message,
}: {
  id: string;
  message?: string;
}) {
  if (!message) return null;

  return (
    <p
      id={id}
      className="flex items-center gap-1.5 text-xs font-medium text-red-400"
    >
      <AlertCircle size={13} className="shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}
