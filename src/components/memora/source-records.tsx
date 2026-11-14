import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readRecordPage } from "@/lib/memora/pagination";
import { escapeIlike } from "@/lib/memora/knowledge-search";
import { useWorkspace } from "./workspace-data";
export function useSourceRecords(fileId: string, kind: "video" | "document", page: number, query: string) {
  const { workspace, user } = useWorkspace();
  const source = useQuery({ queryKey: ["source-head", user?.id, workspace?.id, fileId, kind], enabled: !!workspace,
    gcTime: 0, refetchInterval: 5000,
    queryFn: async () => {
      if (!workspace) throw new Error("Workspace required");
      const file = await supabase.from("files").select().eq("workspace_id", workspace.id).eq("id", fileId).maybeSingle();
      if (file.error) throw new Error("Source could not be read");
      const video = kind === "video" ? await supabase.from("videos").select().eq("workspace_id", workspace.id).eq("file_id", fileId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle() : { data: null, error: null };
      const document = kind === "document" ? await supabase.from("documents").select().eq("workspace_id", workspace.id).eq("file_id", fileId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle() : { data: null, error: null };
      if (video.error || document.error) throw new Error("Processing result could not be read");
      return { file: file.data, video: video.data, document: document.data };
    } });
  const records = useQuery({ queryKey: ["source-page", user?.id, workspace?.id, fileId, source.data?.video?.id, source.data?.document?.id, page, query], enabled: !!workspace && !!source.data, gcTime: 0, refetchInterval: 5000,
    queryFn: async () => {
      if (!workspace || !source.data) throw new Error("Source required");
      const video = source.data.video, document = source.data.document;
      const segments = video ? await readRecordPage((from, to) => {
        let q = supabase.from("transcript_segments").select().eq("workspace_id", workspace.id).eq("video_id", video.id).order("start_seconds").order("id").range(from, to);
        if (query) q = q.ilike("content", `%${escapeIlike(query)}%`);
        return q;
      }, page) : { rows: [], hasNext: false };
      const pages = document && source.data.file?.format !== "PPTX" ? await readRecordPage((from, to) => {
        let q = supabase.from("document_pages").select().eq("workspace_id", workspace.id).eq("document_id", document.id).order("page_number").order("id").range(from, to);
        if (query) q = q.ilike("content", `%${escapeIlike(query)}%`); return q;
      }, page) : { rows: [], hasNext: false };
      const slides = document && source.data.file?.format === "PPTX" ? await readRecordPage((from, to) => {
        let q = supabase.from("document_slides").select().eq("workspace_id", workspace.id).eq("document_id", document.id).order("slide_number").order("id").range(from, to);
        if (query) q = q.ilike("content", `%${escapeIlike(query)}%`); return q;
      }, page) : { rows: [], hasNext: false };
      const frames = video ? await supabase.from("video_frames").select().eq("workspace_id", workspace.id).eq("video_id", video.id).order("timestamp_seconds").order("id").range(0, 59) : { data: [], error: null };
      if (frames.error) throw new Error("Frames could not be read");
      return { segments: segments.rows, pages: pages.rows, slides: slides.rows, frames: frames.data, hasNext: segments.hasNext || pages.hasNext || slides.hasNext };
    } });
  return { source, records };
}
