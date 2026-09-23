"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Lightbulb, Send, Sparkles } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import { useAlert } from "@/components/ui/AlertProvider";
import BusyLabel from "@/components/ui/BusyLabel";
import {
  FEEDBACK_KINDS,
  FEEDBACK_KIND_COPY,
  MAX_FEEDBACK_EMAIL,
  MAX_FEEDBACK_MESSAGE,
  MAX_FEEDBACK_NAME,
  MIN_FEEDBACK_MESSAGE,
  looksLikeEmail,
  type FeedbackKind,
} from "@/lib/feedback";
import FeedbackSent from "./FeedbackSent";
import ScreenshotField from "./ScreenshotField";

/**
 * The form itself.
 *
 * Three decisions worth keeping:
 *
 * **The kind is asked first, and it changes the prompt.** A blank box under
 * "Tell us anything" gets "the site is slow"; the same box under "What were you
 * doing, and what happened instead?" gets a page, a step and a device. The
 * placeholder is written per kind in lib/feedback.ts for exactly that reason,
 * and it is a prompt rather than a label — the visible label above the box
 * stays put, because a placeholder that disappears the moment somebody types is
 * not a label (§8, and the Forms/Input Labels rule in the ui-ux-pro-max data).
 *
 * **Name and email are optional and say so.** The people most worth hearing
 * from here are signed out and mid-annoyance; a required contact field is how a
 * feedback form ends up collecting nothing. The email's help text is honest
 * about what it buys them — a reply — rather than pretending it is required.
 *
 * **A refusal is answered next to the control that caused it.** Every rule the
 * API enforces is checked here first, so the common case never costs a round
 * trip, and the API's own refusal carries the field key so a rule only this
 * side knows about still lands on the right box. The caret is moved there too:
 * a red border the sender has to hunt for is a validation message that did not
 * do its job.
 */

type Field = "kind" | "message" | "screenshot" | "name" | "email";

/** The icon each kind wears. Lucide, in currentColor, like every other icon in
 *  the app — never an emoji. */
const KIND_ICON: Record<FeedbackKind, React.ReactNode> = {
  ISSUE: <AlertTriangle size={20} aria-hidden="true" />,
  SUGGESTION: <Lightbulb size={20} aria-hidden="true" />,
  FEATURE: <Sparkles size={20} aria-hidden="true" />,
};

/** Form order, so the caret lands on the first thing that is wrong rather than
 *  on whichever key the object happens to iterate first. */
const FIELD_ORDER: Field[] = ["kind", "message", "screenshot", "name", "email"];

const FIELD_ID: Record<Field, string> = {
  kind: "feedback-kind",
  message: "feedback-message",
  screenshot: "feedback-screenshot",
  name: "feedback-name",
  email: "feedback-email",
};

export default function FeedbackForm({ pagePath }: { pagePath: string | null }) {
  const { alert } = useAlert();

  const [kind, setKind] = useState<FeedbackKind | "">("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);

  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  // Where the thank-you panel lands, so a sender on a phone is not left looking
  // at the middle of a panel that just changed under them.
  // Typed as the base element and assigned through a callback because the two
  // branches below hang it on different tags — a <form> while there is
  // something to send, a <div> once there is not.
  const panelRef = useRef<HTMLElement | null>(null);

  /**
   * Drives the stagger reveal (`.t-stagger` / `.t-stagger-line`, transitions.dev).
   *
   * The class has to arrive *after* the first paint rather than be written into
   * the markup: a transition needs two states, and one that is already there
   * when the browser first lays the element out has nothing to move from — the
   * rows would simply appear. Re-running it when the form becomes the thank-you
   * gives that swap the same reveal, so the panel changing under the sender
   * reads as one movement rather than a jump cut.
   *
   * It is written onto the node rather than held in state on purpose. This is
   * the effect's proper job — pushing a value out to the DOM — and a state
   * round trip for a class nothing else reads is the cascading re-render the
   * react-hooks rule exists to stop.
   */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const frame = requestAnimationFrame(() => panel.classList.add("is-shown"));
    return () => cancelAnimationFrame(frame);
  }, [isSent]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;

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
            title: "We could not send that",
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

  if (isSent) {
    return (
      <FeedbackSent
        hasEmail={!!email.trim()}
        onSendAnother={sendAnother}
        panelRef={setPanel}
      />
    );
  }

  return (
    <form
      ref={setPanel}
      onSubmit={handleSubmit}
      noValidate
      className="t-stagger scroll-mt-[var(--nav-offset)] glass-panel relative overflow-clip rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-5 sm:p-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent-orange/10 blur-[90px]"
      />

      <div className="relative z-10 flex flex-col gap-7">
        {/* 1 — what this is about */}
        <fieldset className="t-stagger-line t-stagger-line--1 m-0 border-0 p-0">
          <legend className="mb-1 block p-0 text-[0.9rem] font-medium text-secondary">
            What is this about?
          </legend>

          <div
            id={FIELD_ID.kind}
            role="radiogroup"
            aria-label="What is this about?"
            aria-invalid={errors.kind ? true : undefined}
            aria-describedby={errors.kind ? `${FIELD_ID.kind}-error` : undefined}
            tabIndex={-1}
            className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            {FEEDBACK_KINDS.map((option) => {
              const isSelected = kind === option;
              const copy = FEEDBACK_KIND_COPY[option];
              return (
                <label
                  key={option}
                  /* The unchosen cards carry the red edge while the group is
                     the thing that is missing, the same tint .input-group
                     paints on an invalid box — a sentence under a row of
                     cards that look untouched is a validation message the eye
                     skips. */
                  className={`relative flex cursor-pointer flex-col gap-2 rounded-[16px] border p-4 transition-all ${
                    isSelected
                      ? "border-accent-orange bg-accent-orange/10 shadow-[0_0_20px_rgba(255,107,43,0.15)]"
                      : errors.kind
                        ? "border-red-500/60 bg-red-500/[0.06] hover:border-red-400"
                        : "border-white/10 bg-black/40 hover:border-white/30"
                  }`}
                >
                  {/* A real radio, visually hidden — the same control the
                      category picker uses, so the arrow keys, the tab stop and
                      what a screen reader announces are the browser's job
                      rather than ours. */}
                  <input
                    type="radio"
                    name="feedback-kind"
                    className="sr-only peer"
                    checked={isSelected}
                    onChange={() => {
                      setKind(option);
                      setErrors((prev) => ({ ...prev, kind: undefined }));
                    }}
                  />

                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-[12px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent-orange peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black ${
                      isSelected
                        ? "bg-accent-orange/15 text-accent-orange"
                        : "bg-white/5 text-secondary"
                    }`}
                  >
                    {KIND_ICON[option]}
                  </span>

                  <span className="text-[0.95rem] font-bold leading-tight text-white">
                    {copy.label}
                  </span>
                  <span className="text-xs leading-relaxed text-secondary">
                    {copy.blurb}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-2">
            <FieldError id={`${FIELD_ID.kind}-error`} message={errors.kind} />
          </div>
        </fieldset>

        {/* 2 — the message */}
        <div className="input-group t-stagger-line t-stagger-line--2">
          <label htmlFor={FIELD_ID.message}>Your message</label>
          <textarea
            id={FIELD_ID.message}
            rows={7}
            value={message}
            maxLength={MAX_FEEDBACK_MESSAGE}
            placeholder={prompt}
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={`${
              errors.message ? `${FIELD_ID.message}-error ` : ""
            }${FIELD_ID.message}-count`}
            onChange={(e) => {
              setMessage(e.target.value);
              if (errors.message) setErrors((prev) => ({ ...prev, message: undefined }));
            }}
            className="resize-y"
          />
          <FieldError id={`${FIELD_ID.message}-error`} message={errors.message} />

          {/* The counter says how far off the floor they are while they are
              under it, and how much room is left once they are over it —
              a bare "0/2000" answers the question nobody is asking. */}
          <p
            id={`${FIELD_ID.message}-count`}
            className={`m-0 text-xs ${remaining < 100 ? "text-accent-orange" : "text-secondary"}`}
          >
            {shortBy > 0
              ? `${shortBy} more character${shortBy === 1 ? "" : "s"} before you can send this.`
              : `${remaining.toLocaleString()} character${
                  remaining === 1 ? "" : "s"
                } left.`}
          </p>
        </div>

        {/* 3 — what they saw, optional */}
        <div className="t-stagger-line t-stagger-line--3">
          <ScreenshotField
            id={FIELD_ID.screenshot}
            file={screenshot}
            error={errors.screenshot}
            onChange={({ file, error }) => {
              setScreenshot(file);
              setErrors((prev) => ({ ...prev, screenshot: error }));
            }}
          />
        </div>

        {/* 4 — who sent it, both optional */}
        <div className="t-stagger-line t-stagger-line--4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="input-group">
            <label htmlFor={FIELD_ID.name}>
              Your name <span className="text-secondary/70">(optional)</span>
            </label>
            <input
              id={FIELD_ID.name}
              type="text"
              value={name}
              maxLength={MAX_FEEDBACK_NAME}
              placeholder="So we know who to thank"
              autoComplete="name"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${FIELD_ID.name}-error` : undefined}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
            />
            <FieldError id={`${FIELD_ID.name}-error`} message={errors.name} />
          </div>

          <div className="input-group">
            <label htmlFor={FIELD_ID.email}>
              Your email <span className="text-secondary/70">(optional)</span>
            </label>
            <input
              id={FIELD_ID.email}
              type="email"
              value={email}
              maxLength={MAX_FEEDBACK_EMAIL}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={`${
                errors.email ? `${FIELD_ID.email}-error ` : ""
              }${FIELD_ID.email}-hint`}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
              }}
            />
            <FieldError id={`${FIELD_ID.email}-error`} message={errors.email} />
            <p id={`${FIELD_ID.email}-hint`} className="m-0 text-xs text-secondary">
              Only so we can reply. We will not add you to anything.
            </p>
          </div>
        </div>

        {/* The page they came from, stated rather than collected silently. */}
        {pagePath && (
          <p className="t-stagger-line t-stagger-line--5 m-0 rounded-[12px] border border-white/5 bg-black/30 px-4 py-3 text-xs text-secondary">
            We will attach the page you came from —{" "}
            <span className="break-all font-mono text-white/80">{pagePath}</span> — and
            your browser version, so an issue is easier to trace.
          </p>
        )}

        <button
          type="submit"
          disabled={isSending}
          className="btn-gradient t-stagger-line t-stagger-line--6 w-full shadow-xl shadow-accent-orange/20"
        >
          {isSending ? (
            <BusyLabel>Sending</BusyLabel>
          ) : (
            <>
              <Send size={18} aria-hidden="true" className="shrink-0" />
              <span>Send Feedback</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
