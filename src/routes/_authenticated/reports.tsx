import { createFileRoute } from "@tanstack/react-router";
import { Reports } from "@/components/memora/workspaces";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/_authenticated/reports")({
  head: () => pageMeta("Reports", "Export source-aware MEMORA storage and knowledge reports."),
  component: Page,
});
function Page() {
  return <Reports />;
}
