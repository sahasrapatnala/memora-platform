
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Check, X, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  decideProcessing,
  dispatchProcessing,
  getDispatchReadiness,
} from "@/lib/memora/api.functions";
import { canReviewProcessing, canDispatchProcessing } from "@/lib/memora/processing-review";
import { cancelProcessing } from "@/lib/memora/processing-cancel.functions";
import { useWorkspace } from "./workspace-data";
import { SectionTitle, Status } from "./shell";

function VideoReadiness({ jobId, workspaceId, busy, onStart, retry }: { jobId: string; workspaceId: string; busy: boolean; onStart: () => void; retry: boolean }) {
  const inspect = useServerFn(getDispatchReadiness);
  const readiness = useQuery({ queryKey: ["video-dispatch-readiness", workspaceId, jobId], queryFn: () => inspect({ data: { jobId, workspaceId } }), refetchInterval: 30000 });
  return <div className="space-y-2">
    <p role="status">{readiness.isPending ? "Checking video processing readiness…" : readiness.error ? "Video readiness could not be verified" : readiness.data?.schemaInstalled ? "Video-only database installed" : "Video-only database could not be verified"}</p>
    {readiness.data && <>
      <p>{readiness.data.readAccessVerified ? "Workspace read access verified" : "Workspace read access could not be verified"}</p>
      {readiness.data.blockers.map((blocker) => <p key={blocker}>{blocker}</p>)}
    </>}
    <Button disabled={busy || readiness.data?.canStart !== true} onClick={onStart}><Play />{busy ? "Starting..." : retry ? "Retry expired attempt" : "Start processing"}</Button>
  </div>;
}

export function ProcessingReview() {
  const { user, workspace, data, refresh } = useWorkspace();

  const decide = useServerFn(decideProcessing);
  const dispatch = useServerFn(dispatchProcessing);
  const cancel = useServerFn(cancelProcessing);

  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const membership = useQuery({
    queryKey: ["processing-review-role", workspace?.id, user?.id],
    enabled: !!workspace && !!user,
    queryFn: async () => {
      if (!workspace || !user) return null;

      const result = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspace.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (result.error) {
        throw new Error("Could not check reviewer access");
      }

      return result.data;
    },
  });

  if (!workspace || !data?.jobs.length) return null;

  const allowed = canReviewProcessing(membership.data?.role);

  async function submit(
    jobId: string,
    decision: "Approved" | "Rejected",
  ) {
    if (!workspace || busy) return;

    setBusy(jobId);

    try {
      await decide({
        data: {
          jobId,
          workspaceId: workspace.id,
          decision,
          reason: reasons[jobId] ?? "",
        },
      });

      await refresh();

      toast.success(
        decision === "Approved"
          ? "Approved. Processing remains subject to demo readiness and enablement."
          : "Request rejected.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Decision could not be saved",
      );
    } finally {
      setBusy(null);
    }
  }

  async function processOriginal(jobId: string) {
    if (!workspace || busy) return;

    setBusy(jobId);

    try {
      const result = await dispatch({
        data: {
          jobId,
          workspaceId: workspace.id,
        },
      });

      await refresh();

      toast.success(`Processing attempt ${result.attempt} accepted. Progress will update from verified worker events.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Processing could not be started",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="content-section">
      <SectionTitle title="Processing review" />

      {membership.error && (
        <p role="alert">
          Reviewer access could not be checked.
        </p>
      )}

      {data.jobs.map((job) => {
        const decision = data.approvals.find(
          (a) => a.processing_job_id === job.id,
        );

        return (
          <div className="integration-row" key={job.id}>
            <div className="min-w-0 flex-1 space-y-2">
              <strong className="block break-words">
                {data.files.find((f) => f.id === job.file_id)?.name ??
                  "Original"}
              </strong>

              <Status value={job.status} />

              {decision && (
                <p className="break-words">
                  {decision.reason} ·{" "}
                  {new Date(decision.created_at).toLocaleString()}
                </p>
              )}

              {allowed && job.status === "Awaiting Review" && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={`Decision reason for ${job.id}`}
                    placeholder="Decision reason"
                    maxLength={1000}
                    value={reasons[job.id] ?? ""}
                    onChange={(e) =>
                      setReasons((prev) => ({
                        ...prev,
                        [job.id]: e.target.value,
                      }))
                    }
                    className="min-w-0 flex-1 basis-full"
                  />

                  <Button
                    disabled={!!busy || !reasons[job.id]?.trim()}
                    onClick={() => void submit(job.id, "Approved")}
                  >
                    <Check />
                    Approve
                  </Button>

                  <Button
                    variant="outline"
                    disabled={!!busy || !reasons[job.id]?.trim()}
                    onClick={() => void submit(job.id, "Rejected")}
                  >
                    <X />
                    Reject
                  </Button>
                </div>
              )}

              {allowed && ["Approved", "Processing"].includes(job.status) && <Button variant="outline" disabled={!!busy} onClick={async () => {
                if (!workspace || busy) return;
                setBusy(job.id);
                try { await cancel({ data: { jobId: job.id, workspaceId: workspace.id } }); await refresh(); toast.success("Processing cancelled. Later worker callbacks will be rejected."); }
                catch (error) { toast.error(error instanceof Error ? error.message : "Cancellation failed"); }
                finally { setBusy(null); }
              }}><X />Cancel</Button>}

              {allowed && canDispatchProcessing(job) && (
                <VideoReadiness jobId={job.id} workspaceId={workspace.id} busy={!!busy} retry={job.status === "Processing"} onStart={() => void processOriginal(job.id)} />
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
