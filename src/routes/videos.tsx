import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { Library } from "@/components/memora/workspaces";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/videos")({
  head: () =>
    pageMeta("Video Intelligence", "Explore timestamped video knowledge and anonymous speakers."),
  component: Page,
});
function Page() {
  const path = useLocation().pathname;
  if (path !== "/videos") return <Outlet />;
  return <Library kind="videos" />;
}
