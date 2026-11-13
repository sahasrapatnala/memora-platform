import { createFileRoute } from "@tanstack/react-router";
import { Auth } from "@/components/memora/auth";
import { pageMeta } from "@/lib/memora/data";
export const Route = createFileRoute("/reset-password")({
  head: () => pageMeta("Reset password", "Securely choose a new password for your MEMORA account."),
  component: () => <Auth recovery />,
});