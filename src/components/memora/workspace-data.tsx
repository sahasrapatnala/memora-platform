import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useRouter } from "@tanstack/react-router";

function useWorkspaceState() {
  const client = useQueryClient();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    setSelected(localStorage.getItem("memora-workspace") ?? "");
    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      setUser(session?.user ?? null);
      if (event === "SIGNED_OUT") client.clear();
      else void client.invalidateQueries();
      void router.invalidate();
    });
    return () => data.subscription.unsubscribe();
  }, [client, router]);
  const workspaceQuery = useQuery({
    queryKey: ["workspaces", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const r = await supabase.from("workspaces").select().order("created_at");
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const workspaces = user ? (workspaceQuery.data ?? []) : [];
  const workspace = workspaces.find((w) => w.id === selected) ?? workspaces[0];
  const records = useQuery({
    queryKey: ["workspace-records", user?.id, workspace?.id],
    enabled: !!user && !!workspace,
    refetchInterval: 5000,
    queryFn: async () => {
      if (!workspace) throw new Error("Select a workspace");
      const [
        files,
        jobs,
        groups,
        knowledge,
        analytics,
        approvals,
        activity,
        reports,
        recommendations,
        cases,
        videos,
        transcripts,
        speakers,
        documents,
        pages,
        slides,
        frames,
        matches,
      ] = await Promise.all([
        supabase
          .from("files")
          .select()
          .eq("workspace_id", workspace.id)
          .neq("status", "Deleted")
          .order("created_at", { ascending: false }),
        supabase
          .from("processing_jobs")
          .select()
          .eq("workspace_id", workspace.id)
          .order("created_at", { ascending: false }),
        supabase.from("duplicate_groups").select().eq("workspace_id", workspace.id),
        supabase.from("knowledge_chunks").select().eq("workspace_id", workspace.id),
        supabase.from("storage_analytics").select().eq("workspace_id", workspace.id),
        supabase.from("approval_requests").select().eq("workspace_id", workspace.id),
        supabase
          .from("activity_logs")
          .select()
          .eq("workspace_id", workspace.id)
          .order("created_at", { ascending: false }),
        supabase.from("reports").select().eq("workspace_id", workspace.id),
        supabase.from("optimization_recommendations").select().eq("workspace_id", workspace.id),
        supabase.from("offboarding_cases").select().eq("workspace_id", workspace.id),
        supabase.from("videos").select().eq("workspace_id", workspace.id),
        supabase
          .from("transcript_segments")
          .select()
          .eq("workspace_id", workspace.id)
          .order("start_seconds"),
        supabase.from("video_speakers").select().eq("workspace_id", workspace.id),
        supabase.from("documents").select().eq("workspace_id", workspace.id),
        supabase.from("document_pages").select().eq("workspace_id", workspace.id).order("page_number").limit(5000),
        supabase.from("document_slides").select().eq("workspace_id", workspace.id).order("slide_number").limit(2000),
        supabase.from("video_frames").select().eq("workspace_id", workspace.id).order("timestamp_seconds").limit(5000),
        supabase.from("duplicate_matches").select().eq("workspace_id", workspace.id).limit(1000),
      ]);
      for (const r of [
        files,
        jobs,
        groups,
        knowledge,
        analytics,
        approvals,
        activity,
        reports,
        recommendations,
        cases,
        videos,
        transcripts,
        speakers,
        documents,
        pages,
        slides,
        frames,
        matches,
      ])
        if (r.error) throw r.error;
      return {
        files: files.data ?? [],
        jobs: jobs.data ?? [],
        groups: groups.data ?? [],
        knowledge: knowledge.data ?? [],
        analytics: analytics.data ?? [],
        approvals: approvals.data ?? [],
        activity: activity.data ?? [],
        reports: reports.data ?? [],
        recommendations: recommendations.data ?? [],
        cases: cases.data ?? [],
        videos: videos.data ?? [],
        transcripts: transcripts.data ?? [],
        speakers: speakers.data ?? [],
        documents: documents.data ?? [],
        pages: pages.data ?? [],
        slides: slides.data ?? [],
        frames: frames.data ?? [],
        matches: matches.data ?? [],
      };
    },
  });
  const selectWorkspace = (id: string) => {
    setSelected(id);
    localStorage.setItem("memora-workspace", id);
  };
  const refresh = () => client.invalidateQueries();
  return {
    user,
    ready,
    workspace,
    workspaces,
    selectWorkspace,
    refresh,
    data: user && workspace ? records.data : undefined,
    loading: !ready || (!!user && workspaceQuery.isPending) || (!!workspace && records.isPending),
    error: user ? workspaceQuery.error ?? records.error : null,
  };
}
const WorkspaceContext = createContext<ReturnType<typeof useWorkspaceState> | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useWorkspaceState();
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider is required");
  return value;
}
