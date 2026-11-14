import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const cancelProcessing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ jobId: z.string().uuid(), workspaceId: z.string().uuid() }).strict())
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const membership = await context.supabase.from("workspace_members").select("role").eq("workspace_id", data.workspaceId).eq("user_id", context.userId).maybeSingle();
    if (membership.error || !membership.data || !["owner", "reviewer"].includes(membership.data.role)) throw new Error("Reviewer access required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await (supabaseAdmin as unknown as SupabaseClient).rpc("cancel_processing_attempt", { p_job: data.jobId, p_workspace: data.workspaceId, p_actor: context.userId });
    if (result.error || result.data !== "Cancelled") throw new Error("The active processing job could not be cancelled");
    return { status: "Cancelled" as const };
  });
