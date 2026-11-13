import { createFileRoute } from "@tanstack/react-router";
import { Offboarding } from "@/components/memora/workspaces";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/_authenticated/offboarding")({
  head: () =>
    pageMeta("Offboarding", "Preserve employee knowledge through reviewed file inventories."),
  component: Page,
});
function Page() {
  return <Offboarding />;
}
