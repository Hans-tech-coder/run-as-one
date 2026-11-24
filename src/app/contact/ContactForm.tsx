"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, Send } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import BusyLabel from "@/components/ui/BusyLabel";
import PhoneField from "@/app/events/[slug]/register/PhoneField";
import SelectField from "@/app/events/[slug]/register/SelectField";
import {
  CONTACT_HONEYPOT,
  CONTACT_TOPICS,
  CONTACT_TOPIC_LABEL,
  MAX_CONTACT_EMAIL,
  MAX_CONTACT_MESSAGE,
  MAX_CONTACT_NAME,
  MIN_CONTACT_MESSAGE,
  type ContactTopic,
} from "@/lib/contact-inquiry";
import type { ContactRace } from "@/lib/contact-races";
import { DEFAULT_COUNTRY } from "@/lib/phone";
import { supportMailto } from "@/lib/site-contact";
import ContactSent from "./ContactSent";
import { FIELD_ID, useContactForm } from "./useContactForm";

const TOPIC_OPTIONS = CONTACT_TOPICS.map((topic) => ({ value: topic, label: CONTACT_TOPIC_LABEL[topic] }));

/**
 * The Contact Us form, on Paper (docs/conventions.md §9): a `.site-form-card`
 * of `.input-group` fields, the wizard's own `PhoneField` and `SelectField`
 * (the frame's palette bridge turns them light, lib/site-look.ts), one solid
 * Send. State, checks and post are `useContactForm`; the sent state is
 * `ContactSent`.
 *
 * `contactEmail` is the address the page already shows on purpose, offered
 * again only when a send fails — the message the sender typed stays in the
 * box either way.
 */
export default function ContactForm({
  races,
  contactEmail,
}: {
  races: ContactRace[];
  contactEmail: string;
}) {
  const { values, set, errors, failure, isSending, isSent, honeypotRef, handleSubmit, setPanel } =
    useContactForm();

  if (isSent) return <ContactSent panelRef={setPanel} />;

  const length = values.message.trim().length;
  const shortBy = MIN_CONTACT_MESSAGE - length;
  const remaining = MAX_CONTACT_MESSAGE - values.message.length;
  const raceOptions = [
    { value: "", label: "Not About One Race" },
    ...races.map((race) => ({ value: race.slug, label: race.label })),
  ];

  return (
    <form
      ref={setPanel}
      onSubmit={handleSubmit}
      noValidate
      className="site-form-card scroll-mt-[calc(var(--nav-offset)+1rem)]"
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="input-group">
            <label htmlFor={FIELD_ID.name}>Your Name</label>
            <input
              id={FIELD_ID.name}
              type="text"
              value={values.name}
              maxLength={MAX_CONTACT_NAME}
              autoComplete="name"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${FIELD_ID.name}-error` : undefined}
              onChange={(e) => set("name", e.target.value)}
            />
            <FieldError id={`${FIELD_ID.name}-error`} message={errors.name} />
          </div>

          <div className="input-group">
            <label htmlFor={FIELD_ID.email}>Your Email</label>
            <input
              id={FIELD_ID.email}
              type="email"
              value={values.email}
              maxLength={MAX_CONTACT_EMAIL}
              placeholder="juan@example.com"
              autoComplete="email"
              inputMode="email"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={`${errors.email ? `${FIELD_ID.email}-error ` : ""}${FIELD_ID.email}-hint`}
              onChange={(e) => set("email", e.target.value)}
            />
            <p id={`${FIELD_ID.email}-hint`} className="m-0 text-xs text-site-muted">
              Our reply goes here.
            </p>
            <FieldError id={`${FIELD_ID.email}-error`} message={errors.email} />
          </div>
        </div>

        <PhoneField
          id={FIELD_ID.phone}
          label="Mobile Number (Optional)"
          value={values.phone}
          defaultCountry={DEFAULT_COUNTRY}
          onChange={(e164) => set("phone", e164)}
          hint="Only if a call would be quicker. Drop the leading zero."
          error={errors.phone}
        />

        {/* One per row: race names run long and a half-width select cuts them off. */}
        <div className="flex flex-col gap-5">
          <SelectField
            id={FIELD_ID.topic}
            label="What Is This About?"
            listboxLabel="Topics"
            placeholder="Choose a Topic"
            value={values.topic}
            options={TOPIC_OPTIONS}
            onChange={(next) => set("topic", next as ContactTopic)}
            error={errors.topic}
          />

          {races.length > 0 && (
            <SelectField
              id={FIELD_ID.race}
              label="Which Race? (Optional)"
              listboxLabel="Races"
              placeholder="Not About One Race"
              value={values.race}
              options={raceOptions}
              onChange={(next) => set("race", next)}
              error={errors.race}
            />
          )}
        </div>

        {/* Clients hire Run As One; Our Services is where that starts. The
            form still sends, for a question before an inquiry. */}
        {values.topic === "ORGANIZING" && (
          <p className="m-0 rounded-control bg-site-surface px-4 py-3 text-sm leading-relaxed text-site-ink">
            Looking to hire us for your race?{" "}
            <Link href="/admin/register" className="site-link">
              Our Services
            </Link>{" "}
            lists what we handle, from online registration to race day, and
            takes your inquiry in a few steps. A quick question first? Send it
            here.
          </p>
        )}

        <div className="input-group">
          <label htmlFor={FIELD_ID.message}>Your Message</label>
          <textarea
            id={FIELD_ID.message}
            rows={7}
            value={values.message}
            maxLength={MAX_CONTACT_MESSAGE}
            placeholder="Your order reference (RM-…), if you have one, helps us find it faster."
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={`${errors.message ? `${FIELD_ID.message}-error ` : ""}${FIELD_ID.message}-count`}
            onChange={(e) => set("message", e.target.value)}
            className="resize-y"
          />
          <FieldError id={`${FIELD_ID.message}-error`} message={errors.message} />
          <p
            id={`${FIELD_ID.message}-count`}
            className={`m-0 text-xs ${remaining < 100 ? "text-site-accent" : "text-site-muted"}`}
          >
            {shortBy > 0
              ? `${shortBy} more character${shortBy === 1 ? "" : "s"} before you can send this.`
              : `${remaining.toLocaleString()} character${remaining === 1 ? "" : "s"} left.`}
          </p>
        </div>

        {/* The honeypot: off-screen, out of the tab order, hidden from
            screen readers. Only a script fills it (/api/contact). */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="contact-website">Website</label>
          <input
            ref={honeypotRef}
            id="contact-website"
            name={CONTACT_HONEYPOT}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>

        {failure && (
          <div
            role="alert"
            className="flex gap-3 rounded-control border border-[var(--status-danger)] px-4 py-3 text-sm leading-relaxed text-site-ink"
          >
            <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--status-danger)]" />
            <p className="m-0">
              {failure.message}{" "}
              {failure.offerEmail ? (
                <>
                  Everything you typed is still here. Press Send to try again, or
                  email it to{" "}
                  <a href={supportMailto(contactEmail)} className="site-link [overflow-wrap:anywhere]">
                    {contactEmail}
                  </a>
                  .
                </>
              ) : null}
            </p>
          </div>
        )}

        <button type="submit" disabled={isSending} className="site-btn site-btn--action w-full">
          {isSending ? (
            <BusyLabel>Sending</BusyLabel>
          ) : (
            <>
              <Send size={18} aria-hidden="true" className="shrink-0" />
              <span>Send Message</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
