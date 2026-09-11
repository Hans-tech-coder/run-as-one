import PublicRouteLoading from "@/components/PublicRouteLoading";

/**
 * The same fallback as `results/loading.tsx`, one level down. That one is
 * keyed on the race, so moving between the winners board, the full
 * leaderboard and one runner's result — all inside the same race — would
 * never show it. This boundary is keyed on what is under the race, so those
 * moves get the running figure too.
 */
export default function Loading() {
  return <PublicRouteLoading />;
}
