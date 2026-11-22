"use client";

import React from "react";
import { Send } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import BusyLabel from "@/components/ui/BusyLabel";
import { MAX_FEEDBACK_EMAIL, MAX_FEEDBACK_MESSAGE, MAX_FEEDBACK_NAME } from "@/lib/feedback";
import FeedbackSent from "./FeedbackSent";
import KindPicker from "./KindPicker";
import ScreenshotField from "./ScreenshotField";
import { FIELD_ID, useFeedbackForm } from "./useFeedbackForm";

/**
 * The form itself, on Paper (docs/conventions.md §9): a card on the paper
 * ground, `.input-group` fields on the field edge, one solid Send. Its state,
 * checks and post are `useFeedbackForm`; the first question is `KindPicker`;
 * the sent state is `FeedbackSent`. It used to fade its rows in on load
 * (`.t-stagger`); Paper has no entrance below the hero, so it is simply there.
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
export default function FeedbackForm({ pagePath }: { pagePath: string | null }) {
  const {
    kind, setKind, message, setMessage, name, setName, email, setEmail,
    screenshot, setScreenshot, errors, setErrors, isSending, screenshotBusy,
    setScreenshotBusy, isSent, remaining, shortBy, prompt, handleSubmit,
    sendAnother, setPanel,
  } = useFeedbackForm(pagePath);

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
      className="site-form-card scroll-mt-[calc(var(--nav-offset)+1rem)]"
    >
      <div className="flex flex-col gap-7">
        {/* 1 — what this is about */}
        <KindPicker
          id={FIELD_ID.kind}
          kind={kind}
          error={errors.kind}
          onPick={(next) => {
            setKind(next);
            setErrors((prev) => ({ ...prev, kind: undefined }));
          }}
        />

        {/* 2 — the message */}
        <div className="input-group">
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
            className={`m-0 text-xs ${remaining < 100 ? "text-site-accent" : "text-site-muted"}`}
          >
            {shortBy > 0
              ? `${shortBy} more character${shortBy === 1 ? "" : "s"} before you can send this.`
              : `${remaining.toLocaleString()} character${
                  remaining === 1 ? "" : "s"
                } left.`}
          </p>
        </div>

        {/* 3 — what they saw, optional */}
        <ScreenshotField
          id={FIELD_ID.screenshot}
          file={screenshot}
          error={errors.screenshot}
          onChange={({ file, error }) => {
            setScreenshot(file);
            setErrors((prev) => ({ ...prev, screenshot: error }));
          }}
          onBusyChange={setScreenshotBusy}
        />

        {/* 4 — who sent it, both optional */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="input-group">
            <label htmlFor={FIELD_ID.name}>
              Your name <span className="font-normal text-site-muted">(optional)</span>
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
              Your email <span className="font-normal text-site-muted">(optional)</span>
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
            <p id={`${FIELD_ID.email}-hint`} className="m-0 text-xs text-site-muted">
              Only so we can reply. We will not add you to anything.
            </p>
          </div>
        </div>

        {/* The page they came from, stated rather than collected silently. */}
        {pagePath && (
          <p className="m-0 rounded-[10px] bg-site-surface px-4 py-3 text-sm text-site-muted">
            We will attach the page you came from —{" "}
            <span className="break-all font-mono text-site-ink">{pagePath}</span> — and
            your browser version, so an issue is easier to trace.
          </p>
        )}

        <button
          type="submit"
          disabled={isSending || screenshotBusy}
          className="site-btn site-btn--action w-full"
        >
          {isSending ? (
            <BusyLabel>Sending</BusyLabel>
          ) : (
            <>
              <Send size={18} aria-hidden="true" className="shrink-0" />
              <span>Send feedback</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
