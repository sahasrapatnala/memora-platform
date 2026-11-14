import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectDuplicates, type ExtractedComparison } from "./duplicate-rules";

export const analyzeWorkspaceDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ workspaceId: z.string().uuid() }).strict())
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const membership = await context.supabase.from("workspace_members").select("role").eq("workspace_id", data.workspaceId).eq("user_id", context.userId).maybeSingle();
    if (membership.error || !membership.data || !["owner", "reviewer"].includes(membership.data.role)) throw new Error("Reviewer access required");
    const [files, documents, pages, slides, videos, transcripts] = await Promise.all([
      context.supabase.from("files").select().eq("workspace_id", data.workspaceId).eq("status", "Uploaded").limit(1000),
      context.supabase.from("documents").select().eq("workspace_id", data.workspaceId).limit(1000),
      context.supabase.from("document_pages").select().eq("workspace_id", data.workspaceId).limit(501),
      context.supabase.from("document_slides").select().eq("workspace_id", data.workspaceId).limit(501),
      context.supabase.from("videos").select().eq("workspace_id", data.workspaceId).limit(1000),
      context.supabase.from("transcript_segments").select().eq("workspace_id", data.workspaceId).limit(20000),
    ]);
    for (const result of [files, documents, pages, slides, videos, transcripts]) if (result.error) throw new Error("Duplicate source records could not be loaded");
    const fileRows = files.data ?? [];
    const documentRows = documents.data ?? [];
    const pageRows = pages.data ?? [];
    const slideRows = slides.data ?? [];
    const videoRows = videos.data ?? [];
    const transcriptRows = transcripts.data ?? [];
    if (pageRows.length > 500 || slideRows.length > 500) throw new Error("This workspace needs batched duplicate analysis; no partial result was saved");
    const items: ExtractedComparison[] = [];
    for (const page of pageRows) {
      const document = documentRows.find((candidate) => candidate.id === page.document_id);
      if (document && page.sha256) items.push({ file_id: document.file_id, source_type: "pdf_page", source_id: page.id, content: page.content ?? "", content_sha256: page.sha256 });
    }
    for (const slide of slideRows) {
      const document = documentRows.find((candidate) => candidate.id === slide.document_id);
      if (document && slide.sha256) items.push({ file_id: document.file_id, source_type: "pptx_slide", source_id: slide.id, content: slide.content ?? "", content_sha256: slide.sha256 });
    }
    for (const video of videoRows) {
      const content = transcriptRows.filter((segment) => segment.video_id === video.id).sort((a, b) => a.start_seconds - b.start_seconds).map((segment) => segment.content).join("\n");
      if (content) items.push({ file_id: video.file_id, source_type: "video_transcript", source_id: video.id, content,
        content_sha256: await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)).then((hash) => Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")) });
    }
    const groups = detectDuplicates(fileRows, items);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const trusted = supabaseAdmin as unknown as SupabaseClient;
    const saved = await trusted.rpc("replace_duplicate_analysis", { p_workspace: data.workspaceId, p_actor: context.userId, p_groups: groups });
    if (saved.error) throw new Error("Duplicate analysis could not be saved");
    return { groups: groups.length, exact: groups.filter((group) => group.method.startsWith("exact")).length,
      near: groups.filter((group) => group.method === "near-text-jaccard").length };
  });
