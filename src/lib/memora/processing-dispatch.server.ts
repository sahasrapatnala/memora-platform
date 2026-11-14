
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { dispatchCandidate } from "./processing-review";
import { validateFile } from "./data";

export async function dispatchApprovedVideo(
  client: SupabaseClient<Database>,
  input: {
    jobId: string;
    workspaceId: string;
    userId: string;
  },
) {
  const { jobId, workspaceId, userId } = input;

  // 1. Verify reviewer permissions.
  const membershipResult = await client
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (
    membershipResult.error ||
    !membershipResult.data ||
    !["owner", "reviewer"].includes(membershipResult.data.role)
  ) {
    throw new Error("Reviewer access required");
  }

  // 2. Load the processing job.
  const jobResult = await client
    .from("processing_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (jobResult.error || !jobResult.data) {
    throw new Error("Processing job not found");
  }

  const job = jobResult.data;

  // 3. Verify the matching approval.
  const decisionResult = await client
    .from("approval_requests")
    .select("*")
    .eq("processing_job_id", jobId)
    .maybeSingle();

  if (decisionResult.error || !decisionResult.data) {
    throw new Error("Processing approval not found");
  }

  dispatchCandidate(job, decisionResult.data);

  // 4. Verify the uploaded original.
  const fileResult = await client
    .from("files")
    .select("*")
    .eq("id", job.file_id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (fileResult.error || !fileResult.data) {
    throw new Error("Original file not found");
  }

  const file = fileResult.data;

  if (
    file.user_id !== job.user_id ||
    file.workspace_id !== job.workspace_id ||
    file.status !== "Uploaded"
  ) {
    throw new Error("Original is no longer eligible");
  }

  if (
    !file.sha256 ||
    !/^[0-9a-f]{64}$/.test(file.sha256) ||
    !["MP4", "MOV"].includes(file.format) ||
    !Number.isSafeInteger(file.size_bytes) ||
    file.size_bytes <= 0 ||
    file.size_bytes > 5368709120
  ) {
    throw new Error("Verified video original required");
  }

  const validation = validateFile(file.name, file.size_bytes);
  if (validation) throw new Error(validation);

  // 5. Verify original owner's workspace membership.
  const ownerMembership = await client
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", job.user_id)
    .maybeSingle();

  if (ownerMembership.error || !ownerMembership.data) {
    throw new Error("Original owner workspace access required");
  }

  // 6. Create a short-lived signed URL using the authenticated client.
  const signedResult = await client.storage
    .from("original-files")
    .createSignedUrl(file.storage_path, 900);

  if (signedResult.error || !signedResult.data) {
    throw new Error("Could not authorize original retrieval");
  }

  // 7. Read server-only processor configuration.
  const processorUrl = process.env["PROCESSING_API_URL"];
  const processorKey = process.env["PROCESSING_API_KEY"];

  if (!processorUrl || !processorKey) {
    throw new Error("Processing service configuration missing");
  }

  // 8. Call the Python processor.
  const response = await fetch(new URL("/process", processorUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${processorKey}`,
    },
    body: JSON.stringify({
      file_id: file.id,
      workspace_id: workspaceId,
      name: file.name,
      source_url: signedResult.data.signedUrl,
      size_bytes: file.size_bytes,
      sha256: file.sha256,
    }),
    signal: AbortSignal.timeout(600000),
  });

  if (!response.ok) {
    throw new Error(`Processing service returned HTTP ${response.status}`);
  }

  const responseText = await response.text();

  const events = responseText
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

  const result = events.at(-1);

  if (!result || result.status !== "ProcessedLocally") {
    throw new Error("Video processing did not complete successfully");
  }

  return {
    jobId,
    status: "ProcessedLocally" as const,
    stage: result.stage,
    language: result.language,
    transcriptSegments: result.transcript_segments,
    durationSeconds: result.duration_seconds,
    keyframeCount: result.keyframe_count,
    persisted: false as const,
  };
}
