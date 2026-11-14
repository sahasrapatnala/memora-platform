import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { setResponseHeader } from "@tanstack/react-start/server";
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";
import { z } from "zod";
import { escapeIlike, queryTerms, rankEvidence } from "./knowledge-search";
import { sourceCitation } from "./knowledge-source";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const searchInput = z.object({
  workspaceId: z.string().uuid(),
  query: z.string().trim().max(200),
  fileId: z.string().uuid().optional(),
  format: z.enum(["MP4", "MOV", "PDF", "PPTX", "DOCX"]).optional(),
}).strict();

async function requireMembership(client: SupabaseClient<Database>, workspaceId: string, userId: string) {
  const result = await client.from("workspace_members").select("id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (result.error || !result.data) throw new Error("Workspace access required");
}

export const searchKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(searchInput)
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    await requireMembership(context.supabase, data.workspaceId, context.userId);
    let fileIds: string[] | null = null;
    if (data.format) {
      const files = await context.supabase.from("files").select("id").eq("workspace_id", data.workspaceId).eq("format", data.format).limit(1000);
      if (files.error) throw new Error("Source files could not be filtered");
      fileIds = files.data.map((file) => file.id);
      if (!fileIds.length) return [];
    }
    let query = context.supabase.from("knowledge_chunks").select().eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false }).limit(100);
    if (data.query) query = query.ilike("content", `%${escapeIlike(data.query)}%`);
    if (data.fileId) query = query.eq("file_id", data.fileId);
    if (fileIds) query = query.in("file_id", fileIds);
    const result = await query;
    if (result.error) throw new Error("Knowledge search failed");
    const ids = Array.from(new Set(result.data.map((row) => row.file_id)));
    const files = ids.length ? await context.supabase.from("files").select("id,name,format").in("id", ids) : { data: [], error: null };
    if (files.error) throw new Error("Search sources could not be loaded");
    return result.data.map((row) => ({
      ...row,
      citation: sourceCitation(row, files.data.find((file) => file.id === row.file_id)?.name ?? "Original source"),
    }));
  });

const answerOutput = z.object({
  output_text: z.string().optional(),
  output: z.array(z.object({
    content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).optional(),
  }).passthrough()).optional(),
}).passthrough();

export const askMemora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ workspaceId: z.string().uuid(), question: z.string().trim().min(3).max(1000), fileId: z.string().uuid().optional() }).strict())
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    await requireMembership(context.supabase, data.workspaceId, context.userId);
    let chunkQuery = context.supabase.from("knowledge_chunks").select().eq("workspace_id", data.workspaceId).order("created_at", { ascending: false }).limit(500);
    if (data.fileId) chunkQuery = chunkQuery.eq("file_id", data.fileId);
    const terms = queryTerms(data.question);
    if (terms.length) chunkQuery = chunkQuery.or(terms.map((term) => `content.ilike.%${escapeIlike(term)}%`).join(","));
    const [chunks, files] = await Promise.all([
      chunkQuery,
      context.supabase.from("files").select("id,name").eq("workspace_id", data.workspaceId).limit(1000),
    ]);
    if (chunks.error || files.error) throw new Error("Workspace evidence could not be retrieved");
    const evidence = rankEvidence(chunks.data, data.question, 8);
    const citations = evidence.map((row) => sourceCitation(row, files.data.find((file) => file.id === row.file_id)?.name ?? "Original source"));
    if (!evidence.length) return { answer: "There is insufficient extracted evidence in this workspace to answer that question.", citations, generated: false };
    const evidenceText = evidence.map((row, index) => `[${index + 1}] ${citations[index]!.label}\n${row.content.slice(0, 5000)}`).join("\n\n");
    try {
      const response = await generateResponse({
        model: "openai/gpt-6-astra",
        input: [
          { role: "system", content: "You are MEMORA's evidence-bound analyst. Use only the supplied extracted evidence. Do not use outside knowledge or infer identities. Answer concisely. Cite supporting evidence with bracketed numbers such as [1]. If the evidence is insufficient, say so. Never invent speakers, events, decisions or sources." },
          { role: "user", content: `Question: ${data.question}\n\nEvidence:\n${evidenceText}` },
        ],
        max_output_tokens: 900,
      });
      const parsed = answerOutput.parse(response);
      const answer = parsed.output_text ?? parsed.output?.flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("\n") ?? "";
      if (!answer.trim()) throw new Error("Empty answer");
      return { answer, citations, generated: true };
    } catch (error) {
      if (error instanceof GatewayError) console.error("AI answer failed", { code: error.code });
      return { answer: null, citations, generated: false, error: "The answer service is unavailable. The retrieved source evidence is shown below; no generated answer was substituted." };
    }
  });
