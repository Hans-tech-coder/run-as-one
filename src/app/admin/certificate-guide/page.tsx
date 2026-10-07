import React from 'react';
import type { Metadata } from 'next';
import { requireActor } from '@/lib/actor';
import { formatEventDay, today } from '@/lib/event-schedule';
import { SITE_NAME } from '@/lib/site-contact';
import DashboardHeader from '../DashboardHeader';
import GuideDocument from './GuideDocument';
import PrintableGuide from './PrintableGuide';

export const metadata: Metadata = {
  title: `E-Certificate Guide | ${SITE_NAME} Admin`,
  // Behind sign-in already; this is belt and braces in case it ever is not.
  robots: { index: false, follow: false },
};

/**
 * The client guide for e-certificate templates (ECERT_GUIDE_PAGE_PLAN.md):
 * what an organizer's designer has to know to make artwork the app can print
 * every finisher's details on.
 *
 * **Every signed-in person reaches it, client viewers included.** It is the
 * one team-side page a viewer may open, and that is safe because it holds no
 * data at all: the same static text for everyone, with the numbers read from
 * the constants the certificate is drawn with. So it gates on `requireActor()`,
 * never `requireTeamActor()`, which would answer a viewer with *Not Part of
 * Your View*.
 *
 * It replaced a private claude.ai artifact so there is one guide to keep
 * current, and so a client reads it signed in rather than at a public link.
 * The person who designs the template usually has no account, which is what
 * **Save as PDF** is for: the browser's own print dialog, over a light copy of
 * the guide portalled onto `<body>` (`PrintableGuide`), so the PDF reads the
 * same whatever the dashboard theme.
 */
export default async function CertificateGuidePage() {
  await requireActor();
  const printedOn = formatEventDay(today());

  return (
    <>
      <DashboardHeader title="E-Certificate Guide" />
      <div className="admin-content">
        <PrintableGuide print={<GuideDocument idPrefix="print-" printedOn={printedOn} />}>
          <GuideDocument idPrefix="" />
        </PrintableGuide>
      </div>
    </>
  );
}
