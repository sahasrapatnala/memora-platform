import { createFileRoute } from "@tanstack/react-router";
import { SettingsWorkspace } from "@/components/memora/workspaces";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/_authenticated/settings")({
  head: () => pageMeta("Settings", "Manage workspace settings and review processing integrations."),
  component: Page,
});
function Page() {
  return <SettingsWorkspace />;
}
