import { describe, expect, it } from "vitest";
import { processingCallbackSchema, processingManifestSchema } from "@/lib/memora/processing-contract";

const identity = {
  action: "complete" as const,
  job_id: "11111111-1111-4111-8111-111111111111",
  workspace_id: "22222222-2222-4222-8222-222222222222",
  dispatch_token: "33333333-3333-4333-8333-333333333333",
  worker_id: "worker-test",
};
const manifest = {
  ...identity,
  version: 1 as const,
  kind: "video" as const,
  format: "MP4" as const,
  language: "en",
  duration_seconds: 20,
  speakers: [],
  speaker_turns: [],
  transcript_segments: [{ start_seconds: 0, end_seconds: 2, content: "Actual extracted text", content_sha256: "a".repeat(64), speaker_key: null }],
  frames: [{ timestamp_seconds: 10, storage_path: `${identity.workspace_id}/${identity.job_id}/${identity.dispatch_token}/frame-${"b".repeat(64)}.jpg`, size_bytes: 100, sha256: "b".repeat(64), thumbnail_path: `${identity.workspace_id}/${identity.job_id}/${identity.dispatch_token}/thumbnail-${"c".repeat(64)}.jpg`, thumbnail_size_bytes: 50, thumbnail_sha256: "c".repeat(64) }],
  pages: [], slides: [], metadata: { speaker_attribution: "unavailable" as const },
};

describe("bounded processing callbacks", () => {
  it("accepts a complete attempt-bound video manifest", () => {
    expect(processingManifestSchema.parse(manifest).transcript_segments).toHaveLength(1);
  });
  it("rejects a frame outside the current attempt staging path", () => {
    const invalid = structuredClone(manifest);
    invalid.frames[0]!.storage_path = `other/path/frame-${"b".repeat(64)}.jpg`;
    expect(processingManifestSchema.safeParse(invalid).success).toBe(false);
  });
  it("rejects invalid source timing", () => {
    const invalid = structuredClone(manifest);
    invalid.transcript_segments[0]!.end_seconds = 0;
    expect(processingManifestSchema.safeParse(invalid).success).toBe(false);
  });
  it("rejects more than sixty frames", () => {
    const invalid = structuredClone(manifest);
    invalid.frames = Array.from({ length: 61 }, () => ({ ...invalid.frames[0]! }));
    expect(processingManifestSchema.safeParse(invalid).success).toBe(false);
  });
  it("does not allow progress to report completion", () => {
    expect(processingCallbackSchema.safeParse({ ...identity, action: "progress", stage: "Transcribing audio", progress: 100, lease_seconds: 300 }).success).toBe(false);
  });
  it("rejects document results carrying video outputs", () => {
    const invalid = { ...manifest, kind: "document", format: "PDF" };
    expect(processingManifestSchema.safeParse(invalid).success).toBe(false);
  });
});
