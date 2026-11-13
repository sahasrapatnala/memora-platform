import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Send, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { requestProcessing } from "@/lib/memora/api.functions";
import { processingActionState } from "@/lib/memora/processing-action";
import { useWorkspace } from "./workspace-data";

type Original = NonNullable<ReturnType<typeof useWorkspace>["data"]>["files"][number];
export function ProcessingAction({ file, close }: { file: Original; close: () => void }) {
  const { user, data, refresh, selectWorkspace } = useWorkspace();
  const request = useServerFn(requestProcessing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ jobId: string; status: string; reused: boolean } | null>(null);
  const membership = useQuery({
    queryKey: ["processing-action-membership", user?.id, file.workspace_id],
    enabled: !!user && !!file.workspace_id && user.id === file.user_id,
    queryFn: async () => {
      if (!user || !file.workspace_id) return false;
      const r = await supabase.from("workspace_members").select("id").eq("workspace_id", file.workspace_id).eq("user_id", user.id).maybeSingle();
      if (r.error) throw new Error("Workspace access could not be checked");
      return !!r.data;
    },
  });
  const state = processingActionState(file, user?.id, membership.data === true, data?.jobs ?? []);
  const job = result ?? (state.job ? { jobId: state.job.id, status: state.job.status, reused: true } : null);
  return <div className="space-y-3">
    {job && <p role="status" className="break-words">Processing request: {job.status}</p>}
    {error && <p role="alert">{error}</p>}
    {membership.error && <p role="alert">Workspace access could not be checked.</p>}
    {job ? <Button variant="outline" asChild><Link to="/upload" onClick={() => {
      if (file.workspace_id) selectWorkspace(file.workspace_id);
      close(); void refresh();
    }}>View Processing Review<ArrowRight /></Link></Button> : <Button disabled={busy || !state.eligible} onClick={async () => {
      if (!state.eligible || !file.workspace_id || busy) return;
      setBusy(true); setError("");
      try {
        const response = await request({ data: { fileId: file.id, workspaceId: file.workspace_id } });
        setResult(response);
        await refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "Processing request could not be saved"); }
      finally { setBusy(false); }
    }}><Send />{busy ? "Requesting…" : "Request Processing"}</Button>}
  </div>;
}