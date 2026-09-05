import React from 'react';
import type { Metadata } from 'next';
import { Scale } from 'lucide-react';
import LegalPage, { type LegalSection } from '@/components/LegalPage';
import { CONTACT_EMAIL, SITE_NAME } from '@/lib/site-contact';

export const metadata: Metadata = {
  title: 'Terms of Service | RunAsOne',
  description:
    'The terms that apply when you register for a running event through RunAsOne, and the split of responsibilities between the platform and the event organizer.',
};

/**
 * What a runner agrees to by using this site.
 *
 * Written against what the app actually does rather than from a template: the
 * checkout really does take card and e-wallet payments through a provider and
 * manual bank transfers with an uploaded receipt, the organizer really does
 * approve those manually, and results really are uploaded by the organizer
 * after the race. Anything this page claims should be checkable in the code.
 *
 * The per-event waiver in src/lib/consent-waiver.ts still governs the race
 * itself — this document is deliberately the layer above it, and section 8
 * says so rather than restating it.
 */
const SECTIONS: LegalSection[] = [
  {
    heading: 'What RunAsOne is',
    body: [
      `${SITE_NAME} is a registration platform. We list running events, take your entry and your payment, and pass your details to the organizer who is actually putting on the race.`,
      'We do not organize, marshal, time, or insure any event on this site. Each event is run by an independent organizer, and the route, the start time, the race kit, the water stations, the safety marshals and the results are theirs.',
      'By registering through this site you are agreeing to these terms with us, and to that event’s own waiver with its organizer.',
    ],
  },
  {
    heading: 'Who can register',
    body: [
      'You may register yourself, or register other people as part of your group, provided you have their permission and the details you give for them are accurate.',
      'When you register someone else you are confirming that they have read the event waiver and agreed to it. Their entry is treated exactly as if they had filled the form in themselves.',
      'Every runner is expected to be in good enough health to take part. Some events set a minimum age or require a parent or guardian to sign for a minor — where an event does, it is stated on that event’s page.',
    ],
  },
  {
    heading: 'Accurate details',
    body: [
      'Your entry is only as good as what you type. Names go onto race bibs, results and e-certificates; emergency contacts get called if something goes wrong on the course; shirt sizes get ordered in bulk weeks before race day.',
      'Check your details before you pay. Once an organizer has ordered kits or closed their list, a correction may no longer be possible.',
    ],
  },
  {
    heading: 'Payment',
    body: [
      'How you can pay depends on what the organizer has switched on for that event. Two routes exist:',
    ],
    bullets: [
      'Online payment — card and e-wallet, handled by our payment provider. Your entry is confirmed automatically once the payment clears. We never see or store your card number.',
      'Bank transfer — you send the amount to the account shown on the event, then upload a photo of the receipt with its reference number. The organizer reviews it and confirms your entry manually, so this route is not instant.',
    ],
  },
  {
    heading: 'Fees',
    body: [
      'The price you see at checkout is the price you pay. It is broken down before you confirm: the entry fee for each runner’s category, a delivery fee if you asked for your kit shipped, a surcharge on the largest shirt sizes where the organizer applies one, and the platform fee.',
      'Payment provider charges, where they apply, are shown as their own line rather than folded silently into the entry fee.',
    ],
  },
  {
    heading: 'Refunds, transfers and cancellations',
    body: [
      'Refund and transfer policies belong to the organizer of each event, not to us. If a race is postponed, moved, or called off, the organizer decides what happens to entries and announces it.',
      'We will help you reach the organizer and will pass on a refund they approve, but we cannot grant one over their head.',
      'A bank transfer the organizer rejects — a receipt that cannot be matched, an amount that does not cover the entry — is not a completed registration, and no place is held for it.',
    ],
  },
  {
    heading: 'Race kits, pickup and delivery',
    body: [
      'Each event says whether kits are collected in person, delivered, or both. Where delivery is offered, the fee depends on whether the address is inside or outside the event’s province, and you declare which when you register.',
      'Deliveries are dispatched by the organizer or their courier. An address you typed incorrectly is not something we can recover a kit from.',
    ],
  },
  {
    heading: 'Liability and the event waiver',
    body: [
      'Running carries real risk — exhaustion, heat, falls, traffic, and pre-existing conditions among them. Before you can complete a registration you are shown that event’s waiver in full and must tick to accept it. That waiver, not this page, is what governs your participation in the race.',
      'Our own liability is limited to the registration service: taking your entry, taking your payment, and passing both to the organizer correctly. We are not liable for injury, loss or damage arising from taking part in an event.',
    ],
  },
  {
    heading: 'Results and e-certificates',
    body: [
      'Official times, rankings and e-certificates are published here after the organizer uploads them, usually within a few days of race day. The timing data is the organizer’s; we publish what they give us.',
      'If your time or ranking looks wrong, it is the organizer who can correct it. Reach them through the event page and the correction shows up here once they make it.',
    ],
  },
  {
    heading: 'Organizer accounts',
    body: [
      'Organizers who sign up to publish events are responsible for the accuracy of everything on their event page, for honouring what they advertise, for the bank accounts they ask runners to pay into, and for handling the personal data of their registrants lawfully.',
      'We may suspend an account that misrepresents an event, collects money for a race it does not run, or misuses runner data.',
    ],
  },
  {
    heading: 'Acceptable use',
    body: [
      'Do not submit entries you have no intention of honouring, use payment details that are not yours, attempt to reach admin or organizer areas you have no account for, scrape runner data from results pages, or interfere with the running of the site.',
    ],
  },
  {
    heading: 'Changes to these terms',
    body: [
      'We will update this page as the platform changes, and the date at the top of it always tells you when it was last rewritten. Registrations you have already completed are governed by the terms in force at the time you made them.',
    ],
  },
  {
    heading: 'Contact',
    body: [
      `Questions about these terms go to ${CONTACT_EMAIL}. Questions about a specific race — its route, its kit, its refunds — are answered fastest by that event’s organizer.`,
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="The Fine Print"
      title="Terms of Service"
      intro="What you agree to when you register through RunAsOne, and where our responsibility ends and the event organizer's begins."
      icon={<Scale size={20} aria-hidden="true" />}
      sections={SECTIONS}
    />
  );
}
