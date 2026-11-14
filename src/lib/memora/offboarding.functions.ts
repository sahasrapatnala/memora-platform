import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeOffboarding } from "./offboarding-rules";
import type { DuplicateGroup } from "./duplicate-rules";

async function adminRpc(name: string, args: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await (supabaseAdmin as unknown as SupabaseClient).rpc(name, args);
  if (result.error) throw new Error("Offboarding operation was rejected");
  return result.data;
}

export const createOffboardingCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ workspaceId: z.string().uuid(), name: z.string().trim().min(1).max(120) }).strict())
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const membership = await context.supabase.from("workspace_members").select("id").eq("workspace_id", data.workspaceId).eq("user_id", context.userId).maybeSingle();
    if (membership.error || !membership.data) throw new Error("Workspace access required");
    const id = await adminRpc("create_offboarding_case", { p_workspace: data.workspaceId, p_actor: context.userId, p_name: data.name });
    return { id: id as string };
  });

export const getOffboardingCaseFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ caseId: z.string().uuid() }).strict())
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const caseResult = await context.supabase.from("offboarding_cases").select().eq("id", data.caseId).maybeSingle();
    if (caseResult.error || !caseResult.data) throw new Error("Offboarding case not found");
    const result = await (context.supabase as unknown as SupabaseClient).from("offboarding_case_files").select("file_id").eq("case_id", data.caseId).eq("workspace_id", caseResult.data.workspace_id).limit(1000);
    if (result.error) throw new Error("Case inventory could not be loaded");
    return (result.data as { file_id: string }[]).map((row) => row.file_id);
  });

export const setOffboardingCaseFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ caseId: z.string().uuid(), fileIds: z.array(z.string().uuid()).max(1000) }).strict())
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const caseResult = await context.supabase.from("offboarding_cases").select().eq("id", data.caseId).maybeSingle();
    if (caseResult.error || !caseResult.data) throw new Error("Offboarding case not found");
    await adminRpc("set_offboarding_case_files", { p_case: data.caseId, p_actor: context.userId, p_file_ids: data.fileIds });
    return { selected: data.fileIds.length };
  });

export const saveOffboardingAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ caseId: z.string().uuid() }).strict())
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const caseResult = await context.supabase.from("offboarding_cases").select().eq("id", data.caseId).maybeSingle();
    if (caseResult.error || !caseResult.data) throw new Error("Offboarding case not found");
    const workspaceId = caseResult.data.workspace_id;
    const [files, selected, groups, matches] = await Promise.all([
      context.supabase.from("files").select().eq("workspace_id", workspaceId).eq("status", "Uploaded").limit(1000),
      (context.supabase as unknown as SupabaseClient).from("offboarding_case_files").select("file_id").eq("case_id", data.caseId).limit(1000),
      context.supabase.from("duplicate_groups").select().eq("workspace_id", workspaceId).limit(1000),
      context.supabase.from("duplicate_matches").select().eq("workspace_id", workspaceId).limit(5000),
    ]);
    if (files.error || selected.error || groups.error || matches.error) throw new Error("Offboarding comparison records could not be loaded");
    const groupRows: DuplicateGroup[] = (groups.data ?? []).map((group) => {
      const extra = group as typeof group & { group_key?: string | null; retained_file_id?: string | null; potential_savings_bytes?: number | null; evidence?: Record<string, string | number | boolean | null> | null };
      return { group_key: extra.group_key ?? group.id, method: group.method as DuplicateGroup["method"], status: "Awaiting Review",
        retained_file_id: extra.retained_file_id ?? null, potential_savings_bytes: extra.potential_savings_bytes ?? 0, evidence: extra.evidence ?? {},
        matches: (matches.data ?? []).filter((match) => match.group_id === group.id).map((match) => ({ file_id: match.file_id, similarity: match.similarity ?? 1, evidence: {} })) };
    });
    const selectedIds = (selected.data as { file_id: string }[] ?? []).map((row) => row.file_id);
    const summary = summarizeOffboarding(selectedIds, files.data ?? [], groupRows);
    await adminRpc("complete_offboarding_analysis", { p_case: data.caseId, p_actor: context.userId, p_summary: summary });
    return summary;
  });
