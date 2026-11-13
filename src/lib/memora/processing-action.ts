import { TERMINAL_JOB_STATUSES } from "./processing-request";

export function processingActionState(
  file: { id: string; user_id: string; workspace_id: string | null; status: string },
  userId: string | undefined,
  member: boolean,
  jobs: { id: string; file_id: string; status: string }[],
) {
  const job = jobs.find(j => j.file_id === file.id && !TERMINAL_JOB_STATUSES.some(s => s === j.status));
  const eligible = !!userId && file.user_id === userId && !!file.workspace_id && member && file.status === "Uploaded";
  return { eligible, job, label: job ? "View Processing Review" : "Request Processing" };
}