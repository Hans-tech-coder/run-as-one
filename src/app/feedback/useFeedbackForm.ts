"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useAlert } from "@/components/ui/AlertProvider";
import {
  FEEDBACK_KIND_COPY,
  MAX_FEEDBACK_MESSAGE,
  MAX_FEEDBACK_NAME,
  MIN_FEEDBACK_MESSAGE,
  looksLikeEmail,
  type FeedbackKind,
} from "@/lib/feedback";

/**
 * The feedback form's state, checks and post — split out of `FeedbackForm`
 * (a 475-line split candidate) so the form file is about the fields. The
 * reasoning behind the rules is on `FeedbackForm`.
 */

export type Field = "kind" | "message" | "screenshot" | "name" | "email";

/** Form order, so the caret lands on the first thing that is wrong rather than
 *  on whichever key the object happens to iterate first. */
export const FIELD_ORDER: Field[] = ["kind", "message", "screenshot", "name", "email"];

export const FIELD_ID: Record<Field, string> = {
  kind: "feedback-kind",
  message: "feedback-message",
  screenshot: "feedback-screenshot",
  name: "feedback-name",
  email: "feedback-email",
};

export function useFeedbackForm(pagePath: string | null) {
  const { alert } = useAlert();

  const [kind, setKind] = useState<FeedbackKind | "">("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);

  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [isSending, setIsSending] = useState(false);
  // The screenshot is still being shrunk; sending now would drop it.
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [isSent, setIsSent] = useState(false);

  // Where the thank-you panel lands, so a sender on a phone is not left looking
  // at the middle of a panel that just changed under them.
  // Typed as the base element and assigned through a callback because the two
  // branches below hang it on different tags — a <form> while there is
  // something to send, a <div> once there is not.
  const panelRef = useRef<HTMLElement | null>(null);

  const remaining = MAX_FEEDBACK_MESSAGE - message.length;
  const shortBy = MIN_FEEDBACK_MESSAGE - message.trim().length;

  const prompt = useMemo(
    () =>
      kind
        ? FEEDBACK_KIND_COPY[kind].placeholder
        : "Pick what this is about first, and we will ask the right question.",
    [kind],
  );

  /** The same rules the route enforces, checked here so the common case never
   *  costs a round trip. The route is still the last word — a tab left open can
   *  post straight at it. */
  const validate = (): Partial<Record<Field, string>> => {
    const next: Partial<Record<Field, string>> = {};

    if (!kind) next.kind = "Choose what this message is about.";

    const trimmed = message.trim();
    if (!trimmed) {
      next.message = "Tell us what happened — the message is empty.";
    } else if (trimmed.length < MIN_FEEDBACK_MESSAGE) {
      next.message = `A little more detail, please — ${shortBy} more character${
        shortBy === 1 ? "" : "s"
      }.`;
    } else if (trimmed.length > MAX_FEEDBACK_MESSAGE) {
      next.message = `That is ${trimmed.length - MAX_FEEDBACK_MESSAGE} characters too long.`;
    }

    if (name.trim().length > MAX_FEEDBACK_NAME) {
      next.name = `That name is longer than ${MAX_FEEDBACK_NAME} characters.`;
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail && !looksLikeEmail(trimmedEmail)) {
      next.email = "That does not look like an email address. Leave it blank if you would rather not say.";
    }

    return next;
  };

  /** Puts the caret where the work is — the wizard's own focusField, which
   *  lives in the register folder and is three lines, so it is repeated here
   *  rather than imported across two unrelated features. */
  const focusField = (field: Field) => {
    const el = document.getElementById(FIELD_ID[field]);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // The scroll is animated; focusing immediately cancels it in some browsers.
    window.setTimeout(() => el.focus({ preventScroll: true }), 300);
  };

  const showFirst = (next: Partial<Record<Field, string>>) => {
    setErrors(next);
    const first = FIELD_ORDER.find((field) => next[field]);
    if (first) focusField(first);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSending || screenshotBusy) return;

    const found = validate();
    if (Object.keys(found).length > 0) {
      showFirst(found);
      return;
    }

    setErrors({});
    setIsSending(true);

    try {
      // Multipart, because a screenshot may ride along. No Content-Type
      // header: the browser writes the boundary itself.
      const body = new FormData();
      body.set("kind", kind);
      body.set("message", message.trim());
      body.set("name", name.trim());
      body.set("email", email.trim());
      if (pagePath) body.set("pagePath", pagePath);
      if (screenshot) body.set("screenshot", screenshot);

      const res = await fetch("/api/feedback", { method: "POST", body });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // A refusal the route attached to one control goes back on that
        // control; anything else is a failure the sender must read, so it gets
        // the blocking dialog rather than a toast that can time out unseen
        // (§9 — a failure is answered, a success is announced).
        if (data?.field && FIELD_ORDER.includes(data.field)) {
          showFirst({ [data.field as Field]: data.error });
        } else {
          alert({
            variant: "danger",
            title: "We Could Not Send That",
            message: data?.error || "Please try again in a moment.",
          });
        }
        return;
      }

      setIsSent(true);
      // The panel's height changes as the form becomes the thank-you; bring its
      // top back into view rather than leaving a phone mid-panel.
      window.setTimeout(
        () => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        0,
      );
    } catch (error) {
      console.error(error);
      alert({
        variant: "danger",
        title: "We could not send that",
        message:
          "Check your connection and try again. Your message is still in the box.",
      });
    } finally {
      setIsSending(false);
    }
  };

  const sendAnother = () => {
    setKind("");
    setMessage("");
    setScreenshot(null);
    setErrors({});
    setIsSent(false);
  };

  const setPanel = (el: HTMLElement | null) => {
    panelRef.current = el;
  };

  return {
    kind, setKind, message, setMessage, name, setName, email, setEmail,
    screenshot, setScreenshot, errors, setErrors, isSending, screenshotBusy,
    setScreenshotBusy, isSent, remaining, shortBy, prompt, handleSubmit,
    sendAnother, setPanel,
  };

}
