import { createFileRoute } from "@tanstack/react-router";
import { DocumentDetail } from "@/components/memora/workspaces";
import { pageMeta } from "@/lib/memora/data";

export const Route = createFileRoute("/_authenticated/documents/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search["page"] === "number" ? search["page"] : undefined,
    slide: typeof search["slide"] === "number" ? search["slide"] : undefined,
  }),
  head: () => pageMeta("Document Results", "Read extracted PDF pages and presentation slides with source references."),
  component: Page,
});
function Page() {
  return <DocumentDetail id={Route.useParams().id} initial={Route.useSearch()} />;
}
