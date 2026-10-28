import PublicRouteLoading from "@/components/PublicRouteLoading";

/**
 * Covers `/`. The home page reads the live event listing on every request
 * (see the note in page.tsx), so a click on the logo or Home from another page
 * used to leave that page sitting still until the reads came back.
 *
 * It lives in the `(home)` group rather than at the app root on purpose: a
 * root `loading.tsx` would answer every top-level move — including the way
 * into /admin, which has its own waits — with the public loading screen.
 */
export default function Loading() {
  return <PublicRouteLoading />;
}
