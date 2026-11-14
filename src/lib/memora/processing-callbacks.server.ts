import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  MAX_PROCESSING_ARTIFACT_BYTES,
  MAX_PROCESSING_MANIFEST_BYTES,
  artifactQuerySchema,
  processingCallbackSchema,
  type ProcessingManifest,
} from "./processing-contract";

// The generated Database type is refreshed only after the reviewed migration is applied.
// This isolated adapter keeps future RPC names out of ordinary client-facing queries.
const trusted = supabaseAdmin as unknown as SupabaseClient;

export function authorizeWorker(request: Request) {
  const configured = process.env["PROCESSING_API_KEY"];
  const supplied = request.headers.get("authorization") ?? "";
  if (!configured || !supplied.startsWith("Bearer ")) return false;
  const expected = createHash("sha256").update(`Bearer ${configured}`).digest();
  const actual = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expected, actual);
}

export function workerError(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function rpc(name: string, args: Record<string, unknown>) {
  const result = await trusted.rpc(name, args);
  if (result.error) {
    console.error(`Processing RPC ${name} rejected the request`, { code: result.error.code });
    throw new Error("Processing attempt rejected");
  }
  return result.data;
}

export async function handleProcessingCallback(request: Request) {
  if (!authorizeWorker(request)) return workerError("Unauthorized", 401);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length <= 0 || length > MAX_PROCESSING_MANIFEST_BYTES) return workerError("Manifest size is outside the supported bounds", 413);
  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_PROCESSING_MANIFEST_BYTES) return workerError("Manifest size is outside the supported bounds", 413);
  let input: unknown;
  try { input = JSON.parse(body); } catch { return workerError("Invalid JSON"); }
  const parsed = processingCallbackSchema.safeParse(input);
  if (!parsed.success) return workerError("Invalid processing callback", 422);
  const callback = parsed.data;
  const identity = {
    p_job: callback["job_id"],
    p_workspace: callback["workspace_id"],
    p_token: callback["dispatch_token"],
    p_worker_id: callback["worker_id"],
  };
  try {
    if (callback.action === "progress") {
      await rpc("progress_processing_attempt", { ...identity, p_stage: callback["stage"], p_progress: callback["progress"], p_lease_seconds: callback["lease_seconds"] });
      return Response.json({ accepted: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (callback.action === "failure") {
      const status = await rpc("fail_processing_attempt", { ...identity, p_error_code: callback["error_code"] });
      return Response.json({ accepted: true, status }, { headers: { "Cache-Control": "no-store" } });
    }
    const manifest: ProcessingManifest = callback;
    const manifestHash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
    const status = await rpc("finalize_processing_attempt", { ...identity, p_manifest: manifest, p_manifest_sha256: manifestHash });
    return Response.json({ accepted: true, status }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return workerError("Processing attempt expired, invalid or superseded", 409);
  }
}

export async function handleProcessingArtifact(request: Request) {
  if (!authorizeWorker(request)) return workerError("Unauthorized", 401);
  const parsed = artifactQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return workerError("Invalid artifact descriptor", 422);
  const descriptor = parsed.data;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length <= 0 || length > MAX_PROCESSING_ARTIFACT_BYTES) return workerError("Artifact size is outside the supported bounds", 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_PROCESSING_ARTIFACT_BYTES) return workerError("Artifact size is outside the supported bounds", 413);
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== descriptor.sha256) return workerError("Artifact SHA-256 mismatch", 422);
  const identity = {
    p_job: descriptor.job_id,
    p_workspace: descriptor.workspace_id,
    p_token: descriptor.dispatch_token,
    p_worker_id: descriptor.worker_id,
  };
  try {
    await rpc("assert_processing_attempt", identity);
    const path = `${descriptor.workspace_id}/${descriptor.job_id}/${descriptor.dispatch_token}/${descriptor.kind}-${actualHash}.jpg`;
    const uploaded = await supabaseAdmin.storage.from("generated-assets").upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (uploaded.error) throw new Error("Artifact storage failed");
    await rpc("register_processing_artifact", {
      ...identity,
      p_kind: descriptor.kind,
      p_path: path,
      p_size: bytes.length,
      p_sha256: actualHash,
    });
    return Response.json({ path, size_bytes: bytes.length, sha256: actualHash }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // An uncertain registration never deletes bytes: a same-hash retry may already own them.
    return workerError("Artifact could not be verified for this attempt", 409);
  }
}
