import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { validateFile } from "./data";
export const registerOriginal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      workspaceId: z.string().uuid(),
      path: z.string(),
      name: z.string(),
      format: z.string(),
      size: z.number().positive(),
    }),
  )
  .handler(async ({ data, context }) => {
    const validation = validateFile(data.name, data.size);
    if (validation) throw new Error(validation);
    const membership = await context.supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (membership.error || !membership.data) throw new Error("Workspace access required");
    if (!data.path.startsWith(`${context.userId}/`)) throw new Error("Invalid file location");
    const download = await context.supabase.storage.from("original-files").download(data.path);
    if (download.error || !download.data) throw new Error("Could not verify the stored original");
    const bytes = await download.data.arrayBuffer();
    if (bytes.byteLength !== data.size) throw new Error("File size verification failed");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { data: file, error } = await context.supabase
      .from("files")
      .insert({
        workspace_id: data.workspaceId,
        user_id: context.userId,
        name: data.name,
        format: data.format,
        size_bytes: data.size,
        storage_path: data.path,
        sha256,
      })
      .select()
      .single();
    if (error || !file) throw new Error("Could not register the original");
    const job = await context.supabase.from("processing_jobs").insert({
      workspace_id: data.workspaceId,
      file_id: file.id,
      user_id: context.userId,
      status: "Awaiting Review",
      stage: "Processing service not connected",
    });
    if (job.error) throw new Error("Original saved, but job registration failed");
    return { id: file.id, sha256, status: "Awaiting Review" };
  });
