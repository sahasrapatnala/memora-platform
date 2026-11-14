import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/processing-artifact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleProcessingArtifact } = await import("@/lib/memora/processing-callbacks.server");
        return handleProcessingArtifact(request);
      },
    },
  },
});
