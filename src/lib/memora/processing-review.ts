import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const reviewInput = z.object({
  jobId: z.string().uuid(), workspaceId: z.string().uuid(),
  decision: z.enum(["Approved", "Rejected"]), reason: z.string().trim().min(1).max(1000),
}).strict();
export const canReviewProcessing = (role?: string) => role === "owner" || role === "reviewer";

// Eligibility is a hint only: the locked claim RPC rechecks the authoritative lease.
export function canDispatchProcessing(job: { status: string; lease_expires_at?: string | null }, now = Date.now()) {
  if (job.status === "Approved") return true;
  const expiry = job.lease_expires_at ? Date.parse(job.lease_expires_at) : NaN;
  return job.status === "Processing" && Number.isFinite(expiry) && expiry <= now;
}

export async function reviewProcessing(
  client: Pick<SupabaseClient<Database>, "rpc">, userId: string, input: z.infer<typeof reviewInput>,
) {
  if (!userId) throw new Error("Sign in required");
  const data = reviewInput.parse(input);
  const result = await client.rpc("decide_processing_job", {
    p_job: data.jobId, p_workspace: data.workspaceId, p_decision: data.decision, p_reason: data.reason,
  });
  if (result.error || !result.data?.[0]) {
    // No provider details, credentials or raw query errors cross the boundary.
    throw new Error("Decision not saved. Check reviewer access and the job's current decision.");
  }
  const row = result.data[0];
  return { jobId: row.job_id, status: row.job_status, decisionId: row.decision_id, reused: row.reused };
}

/** Future server-only dispatcher input. This is not an executable claim or a source URL. */
export interface ProcessingDispatchCandidate {
  job_id: string; file_id: string; workspace_id: string; decision_id: string;
  dispatch_status: "Not connected";
}
export function dispatchCandidate(
  job: { id: string; file_id: string; workspace_id: string | null; status: string; lease_expires_at?: string | null },
  decision: { id: string; processing_job_id: string | null; status: string; file_id: string | null; workspace_id: string | null } | undefined,
): ProcessingDispatchCandidate {
  if (!canDispatchProcessing(job) || !job.workspace_id || !decision || decision.status !== "Approved" || decision.processing_job_id !== job.id || decision.file_id !== job.file_id || decision.workspace_id !== job.workspace_id) {
    throw new Error("An approved matching processing decision is required");
  }
  return { job_id: job.id, file_id: job.file_id, workspace_id: job.workspace_id, decision_id: decision.id, dispatch_status: "Not connected" };
}