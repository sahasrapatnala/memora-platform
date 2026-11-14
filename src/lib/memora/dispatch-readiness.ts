import { dispatchCandidate } from "./processing-review";

export function validateDispatchReadiness(input: {
  job: { id: string; file_id: string; workspace_id: string | null; user_id: string; status: string; lease_expires_at?: string | null };
  decision: { id: string; processing_job_id: string | null; status: string; file_id: string | null; workspace_id: string | null } | undefined;
  file: { id: string; user_id: string; workspace_id: string | null; status: string; size_bytes: number; sha256: string | null; format: string };
  userId: string;
  role: string | undefined;
  ownerIsMember: boolean;
  capabilities?: { schemaInstalled: boolean; permissionsVerified: boolean; readAccessVerified?: boolean; reason?: string };
  processingEnabled?: boolean;
  workerConfigured?: boolean;
}) {
  if (!input.userId || !["owner", "reviewer"].includes(input.role ?? "")) throw new Error("Reviewer access required");
  const candidate = dispatchCandidate(input.job, input.decision);
  const { file, job } = input;
  if (file.id !== job.file_id || file.workspace_id !== job.workspace_id || file.user_id !== job.user_id || !input.ownerIsMember || file.status !== "Uploaded") throw new Error("Original is no longer eligible");
  if (!Number.isSafeInteger(file.size_bytes) || file.size_bytes <= 0 || file.size_bytes > 5368709120 || !file.sha256 || !/^[0-9a-f]{64}$/.test(file.sha256) || !["MP4", "MOV", "PDF", "PPTX", "DOCX"].includes(file.format)) throw new Error("Verified supported original required");
  const schemaInstalled = input.capabilities?.schemaInstalled === true;
  const permissionsVerified = input.capabilities?.permissionsVerified === true;
  const videoSupported = ["MP4", "MOV"].includes(file.format);
  return {
    jobId: candidate.job_id,
    status: "Blocked" as const,
    dispatched: false as const,
    architecture: schemaInstalled ? "Video-only demo" : "Unverified",
    schemaInstalled,
    permissionsVerified,
    readAccessVerified: input.capabilities?.readAccessVerified === true,
    processingEnabled: input.processingEnabled === true,
    canStart: schemaInstalled && permissionsVerified && videoSupported && input.processingEnabled === true && input.workerConfigured === true,
    blockers: [
      ...(input.capabilities?.reason ? [`Runtime check failed: ${input.capabilities.reason}`] : []),
      ...(!schemaInstalled ? ["Video-only processing database capabilities could not be verified"] : []),
      ...(!permissionsVerified ? ["Client write restrictions require the separate database permission verification; readiness does not change permissions"] : []),
      ...(!videoSupported ? ["The installed demo supports MP4 and MOV only"] : []),
      ...(input.processingEnabled !== true ? ["Video processing is disabled pending separate demo approval"] : []),
      ...(input.workerConfigured !== true ? ["Local worker connection is not configured"] : ["Worker readiness will be checked before dispatch"]),
      "Worker delivery, private artifact callbacks and finalization are untested",
      "Real-file end-to-end persistence has not passed",
    ],
  };
}