import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/processing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleProcessingCallback } = await import("@/lib/memora/processing-callbacks.server");
        return handleProcessingCallback(request);
      },
    },
  },
});
