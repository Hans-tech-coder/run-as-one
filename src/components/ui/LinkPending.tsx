"use client";

import React from "react";
import { useLinkStatus } from "next/link";
import LoadingDots from "./LoadingDots";

/**
 * The pending marker inside a navigation link.
 *
 * `loading.tsx` answers the click by replacing the content area, but it cannot
 * say *which* link was clicked: the sidebar's active state comes from
 * `usePathname()`, and that does not move until the navigation commits, so for
 * the length of the wait the highlight is still sitting on the page being left.
 * This puts the answer on the item that was pressed.
 *
 * Two details keep it from being noise. The slot is always in the layout and
 * only its opacity changes, so an appearing indicator never nudges the label;
 * and the fade in is delayed, so a navigation that resolves in under that delay
 * never flashes anything at all. Must be rendered as a descendant of a
 * `<Link>` — `useLinkStatus` reads the status of the link above it.
 */
export default function LinkPending() {
  const { pending } = useLinkStatus();

  return (
    <span
      className={`nav-pending ${pending ? "is-pending" : ""}`}
      aria-hidden="true"
    >
      <LoadingDots size="sm" label="" />
    </span>
  );
}
