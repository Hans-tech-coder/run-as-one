import React from 'react';

/**
 * The surface a page uses when it has no content to show — a 404, a channel
 * that is not live yet, an empty results list.
 *
 * It is the winners-board panel from /events/[slug]/results, lifted out so the
 * pages that say "there is nothing here" all say it on the same object: 24px
 * radius, a barely-there gradient fill, an inset highlight along the top edge,
 * and one warm and one cool orb bleeding in from opposite corners. A runner
 * who hits a dead link should recognise the surface, not wonder which site
 * they landed on.
 */
export function StatusPanel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-[24px] border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] sm:p-10 ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 -mr-32 -mt-32 h-[300px] w-[300px] rounded-full bg-accent-orange/10 blur-[80px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 -mb-32 -ml-32 h-[240px] w-[240px] rounded-full bg-accent-blue/10 blur-[80px]"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** The rounded-square icon plate that sits above a StatusPanel's headline. */
export function IconBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-accent-orange/20 bg-accent-orange/10 text-accent-orange shadow-[0_0_20px_rgba(255,107,0,0.15)]">
      {children}
    </div>
  );
}

/**
 * The two blurred accent orbs every top-level page floats behind its content.
 *
 * Copied out of /events and /results rather than re-typed, so a page that is
 * reached by accident is lit exactly like one reached on purpose.
 */
export function PageOrbs() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[10%] -top-[10%] -z-10 h-[800px] w-[800px] rounded-full bg-accent-blue opacity-15 blur-[200px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[10%] top-[20%] -z-10 h-[600px] w-[600px] rounded-full bg-accent-orange opacity-15 blur-[200px]"
      />
    </>
  );
}
