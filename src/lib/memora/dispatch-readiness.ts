import { dispatchCandidate } from "./processing-review";

export function validateDispatchReadiness(input: {
  job: { id: string; file_id: string; workspace_id: string | null; user_id: string; status: string };
  decision: { id: string; processing_job_id: string | null; status: string; file_id: string | null; workspace_id: string | null } | undefined;
  file: { id: string; user_id: string; workspace_id: string | null; status: string; size_bytes: number; sha256: string | null; format: string };
  userId: string;
  role: string | undefined;
  ownerIsMember: boolean;
}) {
  if (!input.userId || !["owner", "reviewer"].includes(input.role ?? "")) throw new Error("Reviewer access required");
  const candidate = dispatchCandidate(input.job, input.decision);
  const { file, job } = input;
  if (file.id !== job.file_id || file.workspace_id !== job.workspace_id || file.user_id !== job.user_id || !input.ownerIsMember || file.status !== "Uploaded") throw new Error("Original is no longer eligible");
  if (!Number.isSafeInteger(file.size_bytes) || file.size_bytes <= 0 || file.size_bytes > 5368709120 || !file.sha256 || !/^[0-9a-f]{64}$/.test(file.sha256) || !["MP4", "MOV"].includes(file.format)) throw new Error("Verified video original required");
  return {
    jobId: candidate.job_id,
    status: "Blocked" as const,
    dispatched: false as const,
    blockers: [
      "Reviewed dispatch and ingestion migrations have not been applied",
      "Processor deployment and shared authentication are unverified",
      "Worker delivery, private artifact callbacks and finalization are untested",
      "Real-file end-to-end persistence has not passed",
    ],
  };
}