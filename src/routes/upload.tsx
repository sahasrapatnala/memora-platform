import { createFileRoute } from "@tanstack/react-router";
import { UploadWorkspace } from "@/components/memora/workspaces";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/upload")({
  head: () =>
    pageMeta("Upload & Process", "Securely preserve originals and track processing jobs."),
  component: Page,
});
function Page() {
  return <UploadWorkspace />;
}
