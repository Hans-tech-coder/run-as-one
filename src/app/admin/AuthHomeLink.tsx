import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SITE_NAME } from '@/lib/site-contact';

/**
 * The way off a sign-in page.
 *
 * `/admin/login` and `/admin/register` are drawn without the sidebar and
 * without the public navbar (see `admin/bare-paths.ts`), which is right — an
 * organizer signing in should not be offered the dashboard's furniture before
 * they have a session. The cost was that both pages were dead ends: a runner
 * who followed an old bookmark, or an organizer who only wanted to look at
 * their own event's page, had nothing to press but the browser's Back button,
 * and a page opened from a link has no Back to press.
 *
 * So the pages carry two ways home, for the two ways people look for one:
 *
 * - **This link, at the foot of the card** (owner, 2026-11-22; it stood above
 *   the card before), for the person scanning for a control. It is the last
 *   line inside `.auth-card`, centred, no rule above it (auth-paper.css), so
 *   it stays in the flow on a short screen — a phone with its keyboard open —
 *   and reads as part of the sheet rather than as page chrome. It is **bare
 *   text and an arrow**, with no fill and no border: drawn as a pill it read
 *   as a third button on a page whose whole job is to get one button pressed.
 * - **The lockup at the head of the card**, for the person who clicks a logo
 *   without reading it. That is `.auth-logo-link`, wired in each page beside
 *   its own heading; it mirrors the public navbar, where the same lockup is
 *   the link home.
 *
 * It names the site rather than saying "Home", because "home" on a page headed
 * *Admin Portal* is ambiguous: the dashboard is an admin's home. Naming where
 * the link goes removes the question.
 */
export default function AuthHomeLink() {
  return (
    <Link href="/" className="auth-home-link">
      <ArrowLeft size={16} aria-hidden="true" className="auth-home-link__icon" />
      {/* One text node, not `Back to {SITE_NAME}`: React splits an
          interpolation with a comment node, and a link named from its contents
          then reads as two fragments to tools that walk the DOM. */}
      <span>{`Back to ${SITE_NAME}`}</span>
    </Link>
  );
}
