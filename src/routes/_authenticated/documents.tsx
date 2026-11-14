import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { Library } from "@/components/memora/workspaces";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/_authenticated/documents")({
  head: () => pageMeta("Document Intelligence", "Explore source-linked document pages and presentation slides."),
  component: Page,
});
function Page() {
  if (useLocation().pathname !== "/documents") return <Outlet />;
  return <Library kind="documents" />;
}
