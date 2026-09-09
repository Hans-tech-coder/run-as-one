import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ];
  },
};

export default nextConfig;
