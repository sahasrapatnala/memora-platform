import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "./../components/memora/dashboard";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/")({
  head: () => pageMeta("Overview", "Your enterprise knowledge and storage overview."),
  component: Page,
});
function Page() {
  return <Dashboard />;
}
