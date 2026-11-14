import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const reviewRetentionRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ recommendationId: z.string().uuid(), decision: z.enum(["Approved", "Rejected"]), reason: z.string().trim().min(1).max(1000) }).strict())
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const recommendation = await context.supabase.from("optimization_recommendations").select().eq("id", data.recommendationId).maybeSingle();
    if (recommendation.error || !recommendation.data) throw new Error("Retention recommendation not found");
    const membership = await context.supabase.from("workspace_members").select("role").eq("workspace_id", recommendation.data.workspace_id).eq("user_id", context.userId).maybeSingle();
    if (membership.error || !membership.data || !["owner", "reviewer"].includes(membership.data.role)) throw new Error("Reviewer access required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await (supabaseAdmin as unknown as SupabaseClient).rpc("review_retention_recommendation", {
      p_recommendation: data.recommendationId, p_actor: context.userId, p_decision: data.decision, p_reason: data.reason,
    });
    if (result.error || !result.data) throw new Error("Retention decision was not saved; verify reviewer access and the exact retained copy");
    return { approvalId: result.data as string, status: data.decision };
  });

export const deleteApprovedOriginal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ recommendationId: z.string().uuid(), approvalId: z.string().uuid(), confirmed: z.literal(true) }).strict())
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    if (process.env["MEMORA_RETENTION_ENABLED"] !== "true") throw new Error("Verified retention deletion is disabled pending migration and end-to-end verification");
    const recommendation = await context.supabase.from("optimization_recommendations").select().eq("id", data.recommendationId).maybeSingle();
    if (recommendation.error || !recommendation.data || recommendation.data.status !== "Approved") throw new Error("Approved retention recommendation required");
    const original = await context.supabase.from("files").select().eq("id", recommendation.data.file_id).eq("workspace_id", recommendation.data.workspace_id).maybeSingle();
    if (original.error || !original.data || original.data.user_id !== context.userId || !original.data.sha256) throw new Error("Only the original owner can confirm deletion");
    const workspaceId = original.data.workspace_id;
    if (!workspaceId) throw new Error("Original workspace required");
    const approval = await context.supabase.from("approval_requests").select().eq("id", data.approvalId).eq("file_id", original.data.id).eq("workspace_id", workspaceId).is("processing_job_id", null).eq("status", "Approved").maybeSingle();
    if (approval.error || !approval.data) throw new Error("Matching retention approval required");
    const retainedId = (recommendation.data as typeof recommendation.data & { retained_file_id?: string | null }).retained_file_id;
    if (!retainedId) throw new Error("Retained copy required");
    const retained = await context.supabase.from("files").select().eq("id", retainedId).eq("workspace_id", workspaceId).eq("status", "Uploaded").maybeSingle();
    if (retained.error || !retained.data || retained.data.sha256 !== original.data.sha256 || !retained.data.sha256) throw new Error("The exact retained copy is unavailable");
    const source = await context.supabase.storage.from("original-files").createSignedUrl(retained.data.storage_path, 900);
    if (source.error || !source.data) throw new Error("Retained copy could not be opened");
    const { verifyStoredOriginal } = await import("./verify-original.server");
    const retainedHash = await verifyStoredOriginal(source.data.signedUrl, retained.data.size_bytes);
    if (retainedHash !== retained.data.sha256) throw new Error("Retained copy integrity verification failed; original preserved");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const trusted = supabaseAdmin as unknown as SupabaseClient;
    const begun = await trusted.rpc("begin_retention_deletion", {
      p_recommendation: data.recommendationId, p_approval: data.approvalId, p_actor: context.userId,
    });
    const deletion = begun.data?.[0] as { storage_path?: string } | undefined;
    if (begun.error || !deletion?.storage_path) throw new Error("Retention deletion could not be authorized");
    const removed = await supabaseAdmin.storage.from("original-files").remove([deletion.storage_path]);
    if (removed.error) {
      await supabaseAdmin.rpc("set_original_deletion", { p_user: context.userId, p_file: original.data.id, p_state: "Uploaded" });
      throw new Error("Storage deletion failed; original retained");
    }
    const completed = await trusted.rpc("complete_retention_deletion", {
      p_recommendation: data.recommendationId, p_approval: data.approvalId, p_actor: context.userId,
    });
    if (completed.error) throw new Error("Storage was removed but accounting finalization failed; retry the confirmed action");
    return { ok: true, reclaimedBytes: original.data.size_bytes };
  });
