import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

export const processingRequestInput = z.object({
  fileId: z.string().uuid(),
  workspaceId: z.string().uuid(),
}).strict();

// Unknown states stay active until an explicit lifecycle is implemented.
export const TERMINAL_JOB_STATUSES = ["Completed", "Failed", "Cancelled", "Rejected"] as const;

export async function createProcessingRequest(
  client: Pick<SupabaseClient<Database>, "from">,
  userId: string,
  input: z.infer<typeof processingRequestInput>,
) {
  if (!userId) throw new Error("Sign in required");
  const data = processingRequestInput.parse(input);
  const original = await client.from("files").select("id,user_id,workspace_id,status")
    .eq("id", data.fileId).eq("workspace_id", data.workspaceId).maybeSingle();
  const file = original.data;
  if (original.error || !file || file.user_id !== userId) throw new Error("Original access required");
  if (file.status !== "Uploaded") throw new Error("Only Uploaded originals can be requested");
  const membership = await client.from("workspace_members").select("id")
    .eq("workspace_id", data.workspaceId).eq("user_id", userId).maybeSingle();
  if (membership.error || !membership.data) throw new Error("Workspace access required");

  const findActive = async () => {
    const result = await client.from("processing_jobs").select("id,status")
      .eq("file_id", file.id).eq("workspace_id", data.workspaceId).eq("user_id", userId)
      .not("status", "in", `(${TERMINAL_JOB_STATUSES.join(",")})`).maybeSingle();
    if (result.error) throw new Error("Could not check existing processing requests");
    return result.data;
  };
  const existing = await findActive();
  if (existing) return { jobId: existing.id, status: existing.status, reused: true };
  const result = await client.from("processing_jobs").insert({
    file_id: file.id, user_id: userId, workspace_id: data.workspaceId,
    status: "Awaiting Review", stage: "Awaiting Review", progress: null,
  }).select("id,status").single();
  if (result.error?.code === "23505") {
    // The unique index arbitrates concurrent requests; read the winner through RLS.
    const winner = await findActive();
    if (winner) return { jobId: winner.id, status: winner.status, reused: true };
    throw new Error("The processing request changed. Please retry.");
  }
  if (result.error || !result.data) throw new Error("Could not create processing request");
  return { jobId: result.data.id, status: result.data.status, reused: false };
}