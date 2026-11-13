import { createFileRoute } from "@tanstack/react-router";
import { Duplicates } from "@/components/memora/workspaces";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/_authenticated/duplicates")({
  head: () =>
    pageMeta(
      "Duplicate Detection",
      "Compare similar content with human review and source preservation.",
    ),
  component: Page,
});
function Page() {
  return <Duplicates />;
}
