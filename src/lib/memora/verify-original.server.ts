import { createHash } from "node:crypto";

// Stream stored bytes: neither a Blob nor a whole-original ArrayBuffer is allocated.
export async function verifyStoredOriginal(url: string, expectedBytes: number) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error("Could not verify the stored original");
  const reader = response.body.getReader();
  const hash = createHash("sha256");
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > expectedBytes) throw new Error("File size verification failed");
      hash.update(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  if (size !== expectedBytes) throw new Error("File size verification failed");
  return hash.digest("hex");
}