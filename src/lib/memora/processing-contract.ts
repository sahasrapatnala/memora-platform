import { z } from "zod";

export const MAX_PROCESSING_MANIFEST_BYTES = 8 * 1024 * 1024;
export const MAX_PROCESSING_ARTIFACT_BYTES = 2 * 1024 * 1024;

const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const identity = {
  job_id: uuid,
  workspace_id: uuid,
  dispatch_token: uuid,
  worker_id: z.string().trim().min(1).max(100),
};
const textHash = sha256;
const assetPath = z.string().max(700).regex(/^[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\/[a-z0-9-]+\.jpg$/);

export const processingProgressSchema = z.object({
  action: z.literal("progress"),
  ...identity,
  stage: z.enum([
    "Downloading original",
    "Original verified",
    "Extracting audio",
    "Transcribing audio",
    "Extracting keyframes",
    "Extracting document",
    "Uploading frame artifacts",
    "Persisting results",
  ]),
  progress: z.number().int().min(0).max(99),
  lease_seconds: z.number().int().min(60).max(900).default(300),
}).strict();

export const processingFailureSchema = z.object({
  action: z.literal("failure"),
  ...identity,
  error_code: z.enum(["DownloadFailed", "IntegrityFailed", "ProcessorFailed", "DeliveryUncertain", "PersistenceFailed"]),
}).strict();

const speakerSchema = z.object({
  key: z.string().regex(/^speaker-[0-9]{1,4}$/),
  label: z.string().trim().min(1).max(80),
}).strict();
const turnSchema = z.object({
  speaker_key: speakerSchema.shape.key,
  start_seconds: z.number().min(0).max(604800),
  end_seconds: z.number().min(0).max(604800),
}).strict();
const segmentSchema = z.object({
  start_seconds: z.number().min(0).max(604800),
  end_seconds: z.number().min(0).max(604800),
  content: z.string().max(20000),
  content_sha256: textHash,
  speaker_key: speakerSchema.shape.key.nullable(),
}).strict();
const frameSchema = z.object({
  timestamp_seconds: z.number().min(0).max(604800),
  storage_path: assetPath,
  size_bytes: z.number().int().positive().max(MAX_PROCESSING_ARTIFACT_BYTES),
  sha256,
  thumbnail_path: assetPath,
  thumbnail_size_bytes: z.number().int().positive().max(MAX_PROCESSING_ARTIFACT_BYTES),
  thumbnail_sha256: sha256,
}).strict();
const pageSchema = z.object({
  page_number: z.number().int().min(1).max(5000),
  content: z.string().max(100000),
  sha256: textHash,
  ocr_required: z.boolean(),
}).strict();
const slideSchema = z.object({
  slide_number: z.number().int().min(1).max(2000),
  title: z.string().max(1000).nullable(),
  notes: z.string().max(50000).nullable(),
  content: z.string().max(100000),
  sha256: textHash,
}).strict();

export const processingManifestSchema = z.object({
  action: z.literal("complete"),
  ...identity,
  version: z.literal(1),
  kind: z.enum(["video", "document"]),
  format: z.enum(["MP4", "MOV", "PDF", "PPTX", "DOCX"]),
  language: z.string().max(40).nullable(),
  duration_seconds: z.number().min(0).max(604800).nullable(),
  speakers: z.array(speakerSchema).max(100),
  speaker_turns: z.array(turnSchema).max(20000),
  transcript_segments: z.array(segmentSchema).max(20000),
  frames: z.array(frameSchema).max(60),
  pages: z.array(pageSchema).max(5000),
  slides: z.array(slideSchema).max(2000),
  metadata: z.object({
    page_count: z.number().int().min(0).max(5000).optional(),
    slide_count: z.number().int().min(0).max(2000).optional(),
    ocr_required_pages: z.array(z.number().int().min(1).max(5000)).max(5000).optional(),
    speaker_attribution: z.enum(["available", "unavailable"]).optional(),
    extraction: z.string().max(100).optional(),
  }).catchall(z.union([z.string().max(1000), z.number(), z.boolean(), z.null()])),
}).strict().superRefine((manifest, ctx) => {
  const video = manifest.kind === "video";
  if (video && !["MP4", "MOV"].includes(manifest.format)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Video format and manifest kind differ" });
  if (!video && !["PDF", "PPTX", "DOCX"].includes(manifest.format)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Document format and manifest kind differ" });
  if (video && (manifest.pages.length || manifest.slides.length || manifest.duration_seconds === null)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Video manifest is inconsistent" });
  if (!video && (manifest.transcript_segments.length || manifest.frames.length || manifest.speakers.length || manifest.speaker_turns.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Document manifest contains video output" });
  if (manifest.format === "PDF" && (manifest.slides.length || !manifest.pages.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "PDF pages are required" });
  if (manifest.format === "PPTX" && (manifest.pages.length || !manifest.slides.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Presentation slides are required" });
  for (const [label, values] of [["segment", manifest.transcript_segments], ["turn", manifest.speaker_turns]] as const) {
    for (const value of values) if (value.end_seconds <= value.start_seconds) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} has an invalid time range` });
  }
  for (const frame of manifest.frames) {
    const prefix = `${manifest.workspace_id}/${manifest.job_id}/${manifest.dispatch_token}/`;
    if (!frame.storage_path.startsWith(prefix) || !frame.thumbnail_path.startsWith(prefix)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Frame is outside its attempt staging path" });
    if (manifest.duration_seconds !== null && frame.timestamp_seconds > manifest.duration_seconds + 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Frame exceeds video duration" });
  }
});

export const processingCallbackSchema = z.union([
  processingProgressSchema,
  processingFailureSchema,
  processingManifestSchema,
]);

export const artifactQuerySchema = z.object({
  ...identity,
  kind: z.enum(["frame", "thumbnail"]),
  sha256,
}).strict();

export type ProcessingManifest = z.infer<typeof processingManifestSchema>;
export type ProcessingCallback = z.infer<typeof processingCallbackSchema>;
