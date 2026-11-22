import React from 'react';
import { archivo } from '@/app/archivo-font';

import '@/app/site.css';
import './Auth.css';
import './auth-paper.css';

/**
 * The sign-in pages on Paper (docs/conventions.md §9, 2026-11-22): sign in,
 * the invitation a hired client's contact opens first, forgot / reset
 * password, and the two-step code — and the wait before each of them
 * (`AuthRouteLoading`). They were the last screens outside the dashboard still
 * in the dark glass look, one click from the public footer's "Organizer login".
 *
 * `AdminShell` draws this round every bare path (bare-paths.ts) except the Our
 * Services inquiry, which renders the whole public frame itself. It is the
 * `.site-paper` ground with `data-theme="light"` — the site's tokens, the
 * light status colours, the logo's deepened inks — plus **`.auth-paper`**, the
 * one scope `auth-paper.css` restyles Auth.css's `auth-*` classes inside.
 * Auth.css itself is left as it is: the dashboard loads it too (admin/loading
 * imports AuthRouteLoading), and the inquiry's steps are written in its
 * `apply-*` classes, so a change there would reach screens this must not.
 *
 * No navbar and no footer: these pages have one job, and AuthHomeLink and the
 * lockup already give the two ways home.
 */
export default function AuthPaperFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className={`site-paper auth-paper ${archivo.variable}`} data-theme="light">
      {children}
    </div>
  );
}
