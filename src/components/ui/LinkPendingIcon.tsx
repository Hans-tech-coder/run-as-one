"use client";

import React from "react";
import { useLinkStatus } from "next/link";
import RunnerLoader from "./RunnerLoader";

/**
 * The public site's answer to "did my click register?", on the link itself.
 *
 * A call to action already carries an icon — the chevron on Register Now, View
 * Results, View Full Leaderboard — and while the page it opens is on its way
 * that icon cross-fades into the running figure, through transitions.dev's
 * icon swap (`.t-icon-swap`). The route's own `loading.tsx` then takes over the
 * content area; this covers the moment before it, which on a phone on mobile
 * data is the part a runner actually sits through.
 *
 * Two details copied from `LinkPending`, for the same reasons. The figure is
 * absolutely placed over the icon's slot, so swapping never nudges the label
 * beside it; and the swap waits 120ms, so a prefetched page that arrives at
 * once never flashes it. The figure is mounted only while pending, so a grid of
 * event cards is not running six hidden animations.
 *
 * Must be rendered inside a `<Link>` — `useLinkStatus` reads the link above it.
 */
export default function LinkPendingIcon({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useLinkStatus();

  return (
    <span
      className={`t-icon-swap link-pending-icon ${className}`.trim()}
      data-state={pending ? "b" : "a"}
      aria-hidden="true"
    >
      <span className="t-icon" data-icon="a">
        {children}
      </span>
      <span className="t-icon" data-icon="b">
        {pending && <RunnerLoader size="sm" tone="current" label="" />}
      </span>
    </span>
  );
}
