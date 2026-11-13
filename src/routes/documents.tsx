import { createFileRoute } from "@tanstack/react-router";
import { Library } from "@/components/memora/workspaces";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/documents")({
  head: () =>
    pageMeta(
      "Document Intelligence",
      "Explore source-linked document pages and presentation slides.",
    ),
  component: Page,
});
function Page() {
  return <Library kind="documents" />;
}
