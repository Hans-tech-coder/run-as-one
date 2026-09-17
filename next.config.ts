import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `forbidden()` and its `forbidden.tsx` boundary (ADMIN_MERGE_PLAN.md,
   * Batch 4): a client viewer who opens one of the team's dashboard screens
   * by URL gets a designed not-allowed page inside the sidebar, with a real
   * 403, rather than a 404 that would read as a broken link. See
   * requireTeamActor in src/lib/actor.ts and src/app/admin/forbidden.tsx.
   */
  experimental: {
    authInterrupts: true,
  },
  /**
   * Results used to live under the event — /events/[slug]/results — and now
   * live in their own section, /results/[slug]. Those old URLs are out in the
   * world already: pasted into Facebook posts, sent to runners in messages,
   * printed on the tarpaulin at the finish line. They are permanent redirects
   * rather than deleted routes so none of that goes dead.
   *
   * Both segments are passed straight through instead of being resolved here,
   * because the destination pages already know how to read either form and send
   * a visitor on to the canonical address — an event as a slug or an old cuid
   * (eventByParam, canonicalResultsPath), a runner as a bib or the row cuid the
   * page used to be addressed by (runnerResultPath), all in
   * src/lib/event-slug.ts. So the oldest link this app ever produced — a cuid
   * event and a cuid runner, both under /events — still lands on the right
   * runner's page, at its readable address.
   *
   * Order matters: Next.js takes the first match, and `full` is a real page
   * that would otherwise be swallowed by the :runner pattern below it.
   */
  async redirects() {
    return [
      {
        source: "/events/:param/results/full",
        destination: "/results/:param/full",
        permanent: true,
      },
      {
        source: "/events/:param/results/:runner",
        destination: "/results/:param/:runner",
        permanent: true,
      },
      {
        source: "/events/:param/results",
        destination: "/results/:param",
        permanent: true,
      },
      /**
       * There is one dashboard now (ADMIN_MERGE_PLAN.md, Batch 2). The super
       * admin's screens moved under /admin with the same names — organizers,
       * communities, feedback and activity — and its home is the Overview, so
       * one rule carries every old address, query string included (a filtered
       * activity link keeps its filters). An address that never existed under
       * /superadmin lands on /admin's own 404 inside the sidebar, never a dead
       * page. Redirects run before src/proxy.ts, so the proxy only ever sees
       * the /admin address.
       */
      /**
       * The organizer accounts screen became the client submissions list
       * (ADMIN_MERGE_PLAN.md, Batch 3). Both of its old addresses go straight
       * to /admin/clients — the /superadmin one ahead of the catch-all below,
       * so it is one hop rather than two.
       */
      {
        source: "/superadmin/organizers",
        destination: "/admin/clients",
        permanent: true,
      },
      {
        source: "/admin/organizers",
        destination: "/admin/clients",
        permanent: true,
      },
      {
        source: "/superadmin",
        destination: "/admin",
        permanent: true,
      },
      {
        source: "/superadmin/:path*",
        destination: "/admin/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
