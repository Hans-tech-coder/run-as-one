"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  CONTACT_FIELD_ORDER,
  CONTACT_HONEYPOT,
  cleanContactInput,
  contactInputErrors,
  type ContactField,
  type ContactInput,
} from "@/lib/contact-inquiry";

/**
 * The Contact Us form's state, checks and post. The checks are
 * lib/contact-inquiry.ts's, the same ones `/api/contact` runs, so the common
 * case never costs a round trip and a refusal from the route still lands on
 * its field. A failed send keeps every typed value — only a sent message
 * clears the form.
 */

export const FIELD_ID: Record<ContactField, string> = {
  name: "contact-name",
  email: "contact-email",
  phone: "contact-phone",
  topic: "contact-topic",
  race: "contact-race",
  message: "contact-message",
};

const EMPTY: ContactInput = { name: "", email: "", phone: "", topic: "", race: "", message: "" };

/** A send that did not go: why, and whether the mail address is the way round it. */
export interface SendFailure {
  message: string;
  /** False for the throttle, where waiting is the answer. */
  offerEmail: boolean;
}

export function useContactForm() {
  const [values, setValues] = useState<ContactInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [failure, setFailure] = useState<SendFailure | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  const set = <K extends keyof ContactInput>(key: K, value: ContactInput[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const focusField = (field: ContactField) => {
    const el = document.getElementById(FIELD_ID[field]);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Focusing at once cancels the smooth scroll in some browsers.
    window.setTimeout(() => el.focus({ preventScroll: true }), 300);
  };

  const showFirst = (next: Partial<Record<ContactField, string>>) => {
    setErrors(next);
    const first = CONTACT_FIELD_ORDER.find((field) => next[field]);
    if (first) focusField(first);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSending) return;
    setFailure(null);

    const input = cleanContactInput(values);
    const found = contactInputErrors(input);
    if (Object.keys(found).length > 0) {
      showFirst(found);
      return;
    }

    setErrors({});
    setIsSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, [CONTACT_HONEYPOT]: honeypotRef.current?.value ?? "" }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.field && (CONTACT_FIELD_ORDER as string[]).includes(data.field)) {
          showFirst({ [data.field as ContactField]: data.error });
        } else {
          setFailure({
            message: data?.error || "Your message was not sent.",
            offerEmail: res.status !== 429,
          });
        }
        return;
      }

      setIsSent(true);
      window.setTimeout(
        () => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        0,
      );
    } catch (error) {
      console.error(error);
      setFailure({
        message: "We could not reach the site, so your message was not sent. Check your connection.",
        offerEmail: true,
      });
    } finally {
      setIsSending(false);
    }
  };

  const setPanel = (el: HTMLElement | null) => {
    panelRef.current = el;
  };

  return { values, set, errors, failure, isSending, isSent, honeypotRef, handleSubmit, setPanel };
}
