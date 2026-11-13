import { createFileRoute } from "@tanstack/react-router";
import { Storage } from "@/components/memora/workspaces";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/_authenticated/storage")({
  head: () =>
    pageMeta(
      "Storage Optimization",
      "Compare knowledge package size and potential storage savings.",
    ),
  component: Page,
});
function Page() {
  return <Storage />;
}
