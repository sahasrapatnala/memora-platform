import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { validateFile } from "./data";
import { canDeleteOriginal } from "./file-rules";
import { createProcessingRequest, processingRequestInput } from "./processing-request";
import { setResponseHeader } from "@tanstack/react-start/server";

export const requestProcessing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(processingRequestInput)
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    return createProcessingRequest(context.supabase, context.userId, data);
  });
// Only a trusted dispatcher should forward this descriptor to the independent worker.
export const getProcessingSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fileId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.from("files").select().eq("id", data.fileId).single();
    const file = result.data;
    if (result.error || !file || file.user_id !== context.userId || file.status !== "Uploaded" || !file.workspace_id || !file.sha256) throw new Error("Original access required");
    const membership = await context.supabase.from("workspace_members").select("id").eq("workspace_id", file.workspace_id).eq("user_id", context.userId).maybeSingle();
    if (membership.error || !membership.data) throw new Error("Workspace access required");
    const validation = validateFile(file.name, file.size_bytes);
    if (validation) throw new Error(validation);
    const source = await context.supabase.storage.from("original-files").createSignedUrl(file.storage_path, 7200);
    if (source.error || !source.data) throw new Error("Could not authorize original retrieval");
    return { file_id: file.id, workspace_id: file.workspace_id, name: file.name, source_url: source.data.signedUrl, size_bytes: file.size_bytes, sha256: file.sha256 };
  });
export const registerOriginal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      workspaceId: z.string().uuid(),
      path: z.string(),
      name: z.string(),
      format: z.string(),
      size: z.number().positive(),
    }),
  )
  .handler(async ({ data, context }) => {
    const validation = validateFile(data.name, data.size);
    if (validation) throw new Error(validation);
    const membership = await context.supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (membership.error || !membership.data) throw new Error("Workspace access required");
    if (!data.path.startsWith(`${context.userId}/`)) throw new Error("Invalid file location");
    const source = await context.supabase.storage.from("original-files").createSignedUrl(data.path, 7200);
    if (source.error || !source.data) throw new Error("Could not verify the stored original");
    const { verifyStoredOriginal } = await import("./verify-original.server");
    const sha256 = await verifyStoredOriginal(source.data.signedUrl, data.size);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.rpc("register_verified_original", {
      p_user: context.userId, p_workspace: data.workspaceId, p_path: data.path,
      p_name: data.name, p_format: data.name.split(".").pop()?.toUpperCase() ?? "",
      p_size: data.size, p_hash: sha256,
    });
    if (result.error || !result.data) throw new Error("Could not register the original. Retry verification.");
    return { id: result.data, sha256, status: "Uploaded" };
  });

export const recordUploadFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ workspaceId: z.string().uuid(), name: z.string().max(255) }))
  .handler(async ({ data, context }) => {
    const member = await context.supabase.from("workspace_members").select("id").eq("workspace_id", data.workspaceId).eq("user_id", context.userId).maybeSingle();
    if (member.error || !member.data) throw new Error("Workspace access required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.from("activity_logs").insert({ workspace_id: data.workspaceId, user_id: context.userId, file_name: data.name, action: "File upload failed" });
    if (result.error) throw new Error("Could not record upload failure");
    return { ok: true };
  });

export const deleteOriginal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fileId: z.string().uuid(), confirmed: z.literal(true) }))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.from("files").select().eq("id", data.fileId).single();
    if (result.error || !result.data || !canDeleteOriginal(result.data.user_id, context.userId, data.confirmed)) throw new Error("Only the owner can delete this original");
    const file = result.data;
    if (file.status === "Deleted") return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const mark = await supabaseAdmin.rpc("set_original_deletion", { p_user: context.userId, p_file: file.id, p_state: "Deleting" });
    if (mark.error) throw new Error("Could not authorize deletion");
    const removed = await supabaseAdmin.storage.from("original-files").remove([file.storage_path]);
    if (removed.error) {
      await supabaseAdmin.rpc("set_original_deletion", { p_user: context.userId, p_file: file.id, p_state: "Uploaded" });
      throw new Error("Deletion failed. Original retained.");
    }
    const finish = await supabaseAdmin.rpc("set_original_deletion", { p_user: context.userId, p_file: file.id, p_state: "Deleted" });
    if (finish.error) throw new Error("Storage removed; retry to finalize deletion history.");
    return { ok: true };
  });
