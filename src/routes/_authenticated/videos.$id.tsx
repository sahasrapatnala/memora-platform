import { createFileRoute } from "@tanstack/react-router";
import { VideoDetail } from "@/components/memora/workspaces";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/_authenticated/videos/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    t: typeof search["t"] === "number" ? search["t"] : undefined,
  }),
  head: () =>
    pageMeta(
      "Visual Transcript",
      "Source-linked speakers, timestamps and original recording references.",
    ),
  component: Page,
});
function Page() {
  return <VideoDetail id={Route.useParams().id} initialSeconds={Route.useSearch().t ?? 0} />;
}
