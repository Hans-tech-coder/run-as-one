import React from 'react';
import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import LegalPage, { type LegalSection } from '@/components/LegalPage';
import { CONTACT_EMAIL, SITE_NAME } from '@/lib/site-contact';

export const metadata: Metadata = {
  title: 'Privacy Policy | RunAsOne',
  description:
    'What personal data RunAsOne collects when you register for a running event, why we collect it, who sees it, and the rights you have over it under the Data Privacy Act of 2012.',
};

/**
 * The data-privacy notice for the platform as a whole.
 *
 * The list in section 2 is the registration and runner tables, field for field
 * — writing it from the schema rather than from a template is the only way it
 * stays true, and it is what makes the notice worth anything under RA 10173.
 * If a column is added to Runner or Registration, it belongs here too.
 *
 * The per-event waiver already carries a data-privacy paragraph a runner ticks
 * at checkout. This page is the standing version of it: broader, always
 * reachable, and not tied to one organizer's wording.
 */
const SECTIONS: LegalSection[] = [
  {
    heading: 'Who this covers',
    body: [
      `This notice explains what ${SITE_NAME} does with personal data collected through this website, and applies to runners who register for events, people registered as part of someone else's group, and organizers who hold accounts here.`,
      'It is written to meet the Data Privacy Act of 2012 (Republic Act No. 10173) and its implementing rules.',
    ],
  },
  {
    heading: 'What we collect',
    body: [
      'Only what a race actually needs. Nothing on this list is optional decoration — each field ends up on a bib, in a kit order, in a results table, or in the hands of a marshal if something goes wrong on the course.',
    ],
    bullets: [
      'For the person paying: name, email address, and mobile number, plus a delivery address and province when a race kit is being shipped.',
      'For each runner entered: first and last name, email address, mobile number, gender, date of birth, shirt size, running community, and any medical condition you choose to disclose.',
      'Emergency contact: the name and mobile number of the person to call if a runner needs help during the event.',
      'Payment records: the amount, the method, the order reference, and — for bank transfers — the reference number and the receipt image you upload. Card and e-wallet details are entered on the payment provider’s own page and never reach our servers.',
      'Consent record: whether the event waiver was accepted and the timestamp at which it was.',
      'Race results: bib number, name, gender, category and finishing times, once the organizer uploads them.',
    ],
  },
  {
    heading: 'Why we collect it',
    body: ['Each purpose below is the reason a specific field exists.'],
    bullets: [
      'To process your registration and payment, and to send you confirmation of both.',
      'To give the organizer the list they need to print bibs, order shirts in the right sizes, pack kits, and manage the start line.',
      'To reach a runner’s emergency contact if there is an incident during the event.',
      'To publish official results and generate e-certificates after the race.',
      'To answer support requests, verify a payment, and investigate disputed or fraudulent registrations.',
    ],
  },
  {
    heading: 'Health information',
    body: [
      'The medical conditions field is optional and is treated as sensitive personal information. It exists so that event medical staff can respond appropriately to a runner they are treating. It is visible only to the organizer of the event you entered, and is never used for marketing, profiling, or shared with anyone else.',
    ],
  },
  {
    heading: 'Who sees your data',
    bullets: [
      'The organizer of the event you registered for. They receive the details of every runner in your registration, because they are the ones running the race.',
      'Our payment provider, which processes card and e-wallet payments and receives only what it needs to charge and confirm the transaction.',
      'Our hosting, database and file-storage providers, which hold the data on our behalf and are not permitted to use it for anything else.',
      'Anyone at all, but only for what a race is expected to publish: your name, bib number, category, gender and finishing time appear in public results. Your contact details, birthdate, address, emergency contact and medical notes never do.',
    ],
  },
  {
    heading: 'What we never do',
    body: [
      'We do not sell your personal data. We do not rent or trade contact lists. We do not pass your details to advertisers, and we do not use the medical field for anything other than the safety purpose it was collected for.',
    ],
  },
  {
    heading: 'How long we keep it',
    body: [
      'Registration and payment records are kept for as long as the organizer may need them to settle the event and for as long as tax and dispute-resolution obligations require.',
      'Race results and e-certificates are kept indefinitely, because a finishing time is a public record a runner expects to be able to look up years later. Only the fields listed above as public are held that way.',
      'Payment receipt images are kept only as long as they are needed to verify and settle the transaction they belong to.',
    ],
  },
  {
    heading: 'How it is protected',
    body: [
      'Data is held on managed infrastructure and transmitted over encrypted connections. Organizer passwords are stored hashed, never in readable form. Access to the admin areas is restricted to authenticated organizer accounts, and an organizer can only see registrations for their own events.',
      'No system is perfect. If a breach occurs that puts your data at serious risk, we will notify you and the National Privacy Commission as the law requires.',
    ],
  },
  {
    heading: 'Registering someone else',
    body: [
      'When you enter another person into a race, you are giving us their personal data. You must have their permission to do so, and you must have shown them the event waiver before you accept it on their behalf. They hold the same rights over their data as you do over yours, and can exercise them directly with us.',
    ],
  },
  {
    heading: 'Your rights',
    body: [
      'Under the Data Privacy Act you may ask to see the personal data we hold about you, have it corrected if it is wrong, object to how it is being processed, ask for it to be erased or blocked where the law allows, receive a copy in a portable form, and complain to the National Privacy Commission.',
      `To exercise any of these, email ${CONTACT_EMAIL} from the address on your registration and tell us what you need. We will respond within a reasonable period.`,
      'Two limits worth stating plainly: we cannot erase data an organizer is legally required to keep for tax or dispute purposes, and a published finishing time is a public race record.',
    ],
  },
  {
    heading: 'Cookies',
    body: [
      'This site sets only the cookies it needs to work — chiefly the session cookie that keeps an organizer signed in to the admin area. We do not use advertising or cross-site tracking cookies.',
    ],
  },
  {
    heading: 'Changes and contact',
    body: [
      'We will update this notice as the platform changes, and the date at the top always tells you when it was last rewritten.',
      `For anything on this page — a question, a request, or a complaint — write to ${CONTACT_EMAIL}.`,
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Data Privacy Act of 2012"
      title="Privacy Policy"
      intro="What we collect when you register for a race, why each field exists, who gets to see it, and how to get it corrected or removed."
      icon={<ShieldCheck size={20} aria-hidden="true" />}
      sections={SECTIONS}
    />
  );
}
