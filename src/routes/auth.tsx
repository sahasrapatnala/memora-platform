import { createFileRoute } from "@tanstack/react-router";
import { Auth } from "@/components/memora/auth";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/auth")({
  head: () => pageMeta("Account", "Sign in securely to preserve your originals with MEMORA."),
  component: Page,
});
function Page() {
  return <Auth />;
}
