import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { dispatchCandidate } from "./processing-review";
import { validProcessingEndpoint } from "./processing-endpoints";
import { requireWorkerReady } from "./worker-readiness.server";

export async function dispatchApprovedOriginal(
  client: SupabaseClient<Database>,
  input: { jobId: string; workspaceId: string; userId: string },
) {
  const { jobId, workspaceId, userId } = input;
  if (process.env["MEMORA_PROCESSING_ENABLED"] !== "true") {
    throw new Error("Processing is disabled until the reviewed dispatch and ingestion migration is applied and verified");
  }
  const processorUrl = process.env["PROCESSING_API_URL"];
  const processorKey = process.env["PROCESSING_API_KEY"];
  const callbackUrl = process.env["PROCESSING_CALLBACK_URL"];
  if (!processorUrl || !processorKey || !callbackUrl) throw new Error("Processing service configuration missing");
  if (!validProcessingEndpoint(processorUrl) || !validProcessingEndpoint(callbackUrl)) {
    throw new Error("Processing endpoints must use HTTPS, except on loopback development hosts");
  }

  const membership = await client.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (membership.error || !membership.data || !["owner", "reviewer"].includes(membership.data.role)) throw new Error("Reviewer access required");
  const jobResult = await client.from("processing_jobs").select().eq("id", jobId).eq("workspace_id", workspaceId).maybeSingle();
  if (jobResult.error || !jobResult.data) throw new Error("Processing job not found");
  const decision = await client.from("approval_requests").select().eq("processing_job_id", jobId).maybeSingle();
  if (decision.error || !decision.data) throw new Error("Processing approval not found");
  dispatchCandidate(jobResult.data, decision.data);
  const fileResult = await client.from("files").select().eq("id", jobResult.data.file_id).eq("workspace_id", workspaceId).maybeSingle();
  if (fileResult.error || !fileResult.data || fileResult.data.status !== "Uploaded") throw new Error("Uploaded original required");

  // Prewarm separately: model downloads may exceed the 15-second dispatch budget.
  // Failure must not consume a fenced attempt or leave an approved job Processing.
  await requireWorkerReady(processorUrl, processorKey);

  const workerId = `app-${crypto.randomUUID()}`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Removed after type regeneration: future trusted RPCs never become browser APIs.
  const trusted = supabaseAdmin as unknown as SupabaseClient;
  const claim = await trusted.rpc("claim_approved_processing_job", {
    p_job: jobId,
    p_workspace: workspaceId,
    p_actor: userId,
    p_worker_id: workerId,
    p_lease_seconds: 300,
  });
  if (claim.error) throw new Error("The processing job could not be claimed");
  const claimed = claim.data?.[0] as {
    outcome?: string; dispatch_token?: string; file_storage_path?: string;
    file_name?: string; file_size_bytes?: number; file_sha256?: string; file_format?: string;
    dispatch_attempts?: number; lease_expires_at?: string;
  } | undefined;
  if (!claimed || claimed.outcome === "AttemptsExhausted") throw new Error("This job has reached its three-attempt limit");
  if (claimed.outcome !== "Claimed" || !claimed.dispatch_token || !claimed.file_storage_path || !claimed.file_sha256 || !claimed.file_name || !claimed.file_size_bytes) {
    throw new Error("The selected job is not currently eligible for dispatch");
  }

  try {
    const source = await client.storage.from("original-files").createSignedUrl(claimed.file_storage_path, 900);
    if (source.error || !source.data) throw new Error("Could not authorize original retrieval");
    const endpoint = new URL("/process", processorUrl);
    const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${processorKey}` },
    body: JSON.stringify({
      file_id: jobResult.data.file_id,
      workspace_id: workspaceId,
      job_id: jobId,
      dispatch_token: claimed.dispatch_token,
      worker_id: workerId,
      callback_url: callbackUrl,
      name: claimed.file_name,
      source_url: source.data.signedUrl,
      size_bytes: claimed.file_size_bytes,
      sha256: claimed.file_sha256,
    }),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
    });
    if (response.status !== 202) throw new Error("The processing service did not accept the job");
  } catch {
    // Delivery may have reached the worker. Fence the attempt rather than retrying POST.
    // If this write is also uncertain, leave recovery to the expired-lease selected claim.
    await trusted.rpc("fail_processing_attempt", {
      p_job: jobId, p_workspace: workspaceId, p_token: claimed.dispatch_token,
      p_worker_id: workerId, p_error_code: "DeliveryUncertain",
    }).then((result) => {
      if (result.error) console.error("Dispatch failure recording rejected", { code: result.error.code });
    }, () => { console.error("Dispatch failure recording unavailable"); });
    throw new Error("Processing delivery was not confirmed. Refresh the job before retrying; no automatic delivery retry was made.");
  }
  return {
    jobId,
    status: "Processing" as const,
    stage: "Dispatch claimed",
    attempt: claimed.dispatch_attempts ?? 1,
    leaseExpiresAt: claimed.lease_expires_at ?? null,
  };
}
