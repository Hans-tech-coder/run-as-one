import { ViewTransition } from 'react';

/**
 * The public site's page-to-page motion: on a client navigation the page
 * being left fades out quickly, then the page arriving fades in and rises a
 * few pixels (`site-page-out` / `site-page-in`, site.css, "Page transitions").
 *
 * Built on React's `<ViewTransition>`, so it costs no animation library and
 * runs only inside a navigation or a Suspense reveal — a first load served
 * whole has none, so it stays the hero's own entrance (`data-enter`). Arriving from a
 * `loading.tsx` screen is the same reveal: the loading figure fades out
 * (`PublicRouteLoading`) and the page fades in.
 *
 * It wraps a **page's** returned tree, never a layout: a layout persists
 * across navigations, so its enter and exit would never fire. Placed first,
 * before any DOM node, because a `<ViewTransition>` inside an element does not
 * animate its enter or exit. `default="none"` keeps it still on everything
 * else that runs as a transition — a tab switch, a filter, a refresh.
 *
 * The navbar and footer do not move: the root is drawn live (site.css), so
 * only the page itself takes part.
 */
export default function PageReveal({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="site-page-in" exit="site-page-out" default="none">
      {children}
    </ViewTransition>
  );
}
