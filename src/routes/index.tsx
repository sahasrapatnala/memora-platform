import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "./../components/memora/dashboard";
import { pageMeta } from "@/lib/memora/data";
import { useWorkspace } from "@/components/memora/workspace-data";
import { Auth } from "@/components/memora/auth";
export const Route = createFileRoute("/")({
  head: () => pageMeta("Overview", "Your enterprise knowledge and storage overview."),
  component: Page,
});
function Page() {
  const { user, ready } = useWorkspace();
  if (!ready) return <p className="data-state" role="status">Checking account…</p>;
  return user ? <Dashboard /> : <Auth />;
}
