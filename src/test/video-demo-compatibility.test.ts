import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { processingManifestSchema, processingProgressSchema } from "@/lib/memora/processing-contract";

const sql = readFileSync("docs/sql-review/video-demo-v1.sql", "utf8");
describe("review-only video worker compatibility", () => {
  it("keeps dispatcher and callback RPC parameter names and return contract", () => {
    const signatures = [
      /claim_approved_processing_job\(\s*p_job uuid,p_workspace uuid,p_actor uuid,p_worker_id text,p_lease_seconds integer/,
      /assert_processing_attempt\(\s*p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text/,
      /progress_processing_attempt\(\s*p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text,p_stage text,p_progress integer,p_lease_seconds integer/,
      /register_processing_artifact\(\s*p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text,p_kind text,p_path text,p_size bigint,p_sha256 text/,
      /finalize_processing_attempt\(\s*p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text,p_manifest jsonb,p_manifest_sha256 text/,
      /fail_processing_attempt\(\s*p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text,p_error_code text/,
      /cancel_processing_attempt\(p_job uuid,p_workspace uuid,p_actor uuid\)/,
    ];
    for (const signature of signatures) expect(sql).toMatch(signature);
    expect(sql).toMatch(/outcome text,dispatch_token uuid/);
    expect(sql).toMatch(/file_storage_path text,file_size_bytes bigint,file_sha256 text,file_format text/);
  });
  it("accepts the existing Python video payload without inferred speakers", () => {
    const workspace = "22222222-2222-4222-8222-222222222222", job = "44444444-4444-4444-8444-444444444444", token = "55555555-5555-4555-8555-555555555555";
    const identity = { workspace_id: workspace, job_id: job, dispatch_token: token, worker_id: "worker" };
    const manifest = { action: "complete", version: 1, ...identity, kind: "video", format: "MP4", language: "en", duration_seconds: 2,
      speakers: [], speaker_turns: [], pages: [], slides: [], metadata: { speaker_attribution: "unavailable", extraction: "Faster-Whisper and OpenCV" },
      transcript_segments: [{ start_seconds: 0, end_seconds: 1, content: "Actual speech", content_sha256: "a".repeat(64), speaker_key: null }],
      frames: [{ timestamp_seconds: 1, storage_path: `${workspace}/${job}/${token}/frame-${"b".repeat(64)}.jpg`, size_bytes: 3, sha256: "b".repeat(64), thumbnail_path: `${workspace}/${job}/${token}/thumbnail-${"c".repeat(64)}.jpg`, thumbnail_size_bytes: 3, thumbnail_sha256: "c".repeat(64) }],
    };
    expect(processingManifestSchema.safeParse(manifest).success).toBe(true);
    expect(processingManifestSchema.safeParse({ ...manifest, frames: [{ ...manifest.frames[0], storage_path: `${workspace}/${job}/old/frame.jpg` }] }).success).toBe(false);
    expect(processingProgressSchema.safeParse({ action: "progress", ...identity, stage: "Transcribing audio", progress: 45, lease_seconds: 300 }).success).toBe(true);
  });
});