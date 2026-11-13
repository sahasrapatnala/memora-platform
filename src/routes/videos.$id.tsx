import { createFileRoute } from "@tanstack/react-router";
import { VideoDetail } from "@/components/memora/workspaces";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/videos/$id")({
  head: () =>
    pageMeta(
      "Visual Transcript",
      "Connected sample speakers, timestamps and video source references.",
    ),
  component: Page,
});
function Page() {
  return <VideoDetail id={Route.useParams().id} />;
}
