import { createFileRoute } from "@tanstack/react-router";
import { Knowledge } from "@/components/memora/workspaces";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/_authenticated/knowledge")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search["q"] === "string" ? search["q"] : undefined,
  }),
  head: () =>
    pageMeta("Knowledge Explorer", "Search source-linked transcripts and structured knowledge."),
  component: Page,
});
function Page() {
  return <Knowledge initialQuery={Route.useSearch().q ?? ""} />;
}
