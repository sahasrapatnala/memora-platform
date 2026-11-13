import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { decideProcessing } from "@/lib/memora/api.functions";
import { canReviewProcessing } from "@/lib/memora/processing-review";
import { useWorkspace } from "./workspace-data";
import { SectionTitle, Status } from "./shell";

export function ProcessingReview() {
  const { user, workspace, data, refresh } = useWorkspace();
  const decide = useServerFn(decideProcessing);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const membership = useQuery({
    queryKey: ["processing-review-role", workspace?.id, user?.id], enabled: !!workspace && !!user,
    queryFn: async () => {
      if (!workspace || !user) return null;
      const result = await supabase.from("workspace_members").select("role").eq("workspace_id", workspace.id).eq("user_id", user.id).maybeSingle();
      if (result.error) throw new Error("Could not check reviewer access");
      return result.data;
    },
  });
  if (!workspace || !data?.jobs.length) return null;
  const allowed = canReviewProcessing(membership.data?.role);
  async function submit(jobId: string, decision: "Approved" | "Rejected") {
    if (!workspace || busy) return;
    setBusy(jobId);
    try {
      await decide({ data: { jobId, workspaceId: workspace.id, decision, reason: reasons[jobId] ?? "" } });
      await refresh();
      toast.success(decision === "Approved" ? "Approved. Processing has not started." : "Request rejected.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Decision could not be saved"); }
    finally { setBusy(null); }
  }
  return <section className="content-section">
    <SectionTitle title="Processing review" />
    {membership.error && <p role="alert">Reviewer access could not be checked.</p>}
    {data.jobs.map(job => {
      const decision = data.approvals.find(a => a.processing_job_id === job.id);
      return <div className="integration-row" key={job.id}>
        <div className="min-w-0 flex-1 space-y-2">
          <strong className="block break-words">{data.files.find(f => f.id === job.file_id)?.name ?? "Original"}</strong>
          <Status value={job.status} />
          {decision && <p className="break-words">{decision.reason} · {new Date(decision.created_at).toLocaleString()}</p>}
          {allowed && job.status === "Awaiting Review" && <div className="flex flex-wrap items-center gap-2">
            <Input aria-label={`Decision reason for ${job.id}`} placeholder="Decision reason" maxLength={1000} value={reasons[job.id] ?? ""} onChange={e => setReasons(prev => ({ ...prev, [job.id]: e.target.value }))} className="min-w-0 flex-1 basis-full" />
            <Button disabled={!!busy || !reasons[job.id]?.trim()} onClick={() => void submit(job.id, "Approved")}><Check />Approve</Button>
            <Button variant="outline" disabled={!!busy || !reasons[job.id]?.trim()} onClick={() => void submit(job.id, "Rejected")}><X />Reject</Button>
          </div>}
        </div>
      </div>;
    })}
  </section>;
}