import { supabase } from "@/integrations/supabase/client";
import { TUS_CHUNK_BYTES, uploadIdentity } from "./upload-rules";

export class UploadPaused extends Error {
  constructor() { super("Upload paused"); }
}

// Persist only object locations and completion flags, never access tokens.
export async function uploadOriginal(file: File, userId: string, workspaceId: string, signal: AbortSignal, onProgress: (uploaded: number, total: number) => void) {
  const { Upload } = await import("tus-js-client");
  const identity = uploadIdentity(userId, workspaceId, file);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const key = `memora-upload-${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}`;
  let record: { path: string; stored: boolean } | undefined;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null");
    if (typeof parsed?.path === "string" && parsed.path.startsWith(`${userId}/`)) record = { path: parsed.path, stored: parsed.stored === true };
  } catch { /* A damaged checkpoint must not block a new upload. */ }
  record ??= { path: `${userId}/${crypto.randomUUID()}/${file.name}`, stored: false };
  const checkpoint = record;
  localStorage.setItem(key, JSON.stringify(checkpoint));
  if (!checkpoint.stored) {
    if (signal.aborted) throw new UploadPaused();
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        signal.removeEventListener("abort", pause);
        if (error) reject(error); else resolve();
      };
      const upload = new Upload(file, {
        endpoint: `${import.meta.env['VITE_SUPABASE_URL']}/storage/v1/upload/resumable`,
        chunkSize: TUS_CHUNK_BYTES,
        retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        fingerprint: async () => `memora-tus-${key}-${checkpoint.path}`,
        metadata: { bucketName: "original-files", objectName: checkpoint.path, contentType: file.type || "application/octet-stream", cacheControl: "3600" },
        onBeforeRequest: async (request) => {
          const { data, error } = await supabase.auth.getSession();
          if (error || !data.session) throw new Error("Sign in again to resume this upload");
          request.setHeader("Authorization", `Bearer ${data.session.access_token}`);
          request.setHeader("apikey", import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY']);
        },
        onProgress,
        onError: error => finish(error),
        onSuccess: () => {
          checkpoint.stored = true;
          localStorage.setItem(key, JSON.stringify(checkpoint));
          finish();
        },
      });
      const pause = () => {
        // Do not terminate the TUS resource; HEAD retrieves its offset on resume.
        void upload.abort(false).then(() => finish(new UploadPaused()), () => finish(new UploadPaused()));
      };
      signal.addEventListener("abort", pause, { once: true });
      void upload.findPreviousUploads().then(previous => {
        if (signal.aborted) { finish(new UploadPaused()); return; }
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      }).catch(error => finish(error instanceof Error ? error : new Error("Could not restore upload checkpoint")));
    });
  }
  return { path: checkpoint.path, complete: () => localStorage.removeItem(key) };
}