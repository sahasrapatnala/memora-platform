import { describe, expect, it, vi, afterEach } from "vitest";
import { verifyStoredOriginal } from "@/lib/memora/verify-original.server";
import { TUS_CHUNK_BYTES, uploadIdentity } from "@/lib/memora/upload-rules";

afterEach(() => vi.unstubAllGlobals());
describe("large original verification", () => {
  it("uses the provider-required 6 MiB chunks", () => expect(TUS_CHUNK_BYTES).toBe(6291456));
  it("scopes resumable checkpoints to the user and workspace", () => {
    const f = { name: "Ericsson.mp4", size: 1140000000, lastModified: 123 };
    expect(uploadIdentity("a", "w", f)).not.toBe(uploadIdentity("b", "w", f));
    expect(uploadIdentity("a", "w", f)).not.toBe(uploadIdentity("a", "other", f));
  });
  it("hashes actual streamed bytes across chunk boundaries", async () => {
    vi.stubGlobal("fetch", async () => new Response(new ReadableStream({ start(c) {
      c.enqueue(new TextEncoder().encode("a")); c.enqueue(new TextEncoder().encode("bc")); c.close();
    } })));
    expect(await verifyStoredOriginal("https://example.test", 3)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("rejects a stored original shorter than the registered size", async () => {
    vi.stubGlobal("fetch", async () => new Response("abc"));
    await expect(verifyStoredOriginal("https://example.test", 4)).rejects.toThrow("File size verification failed");
  });
  it("rejects a stored original larger than the registered size", async () => {
    vi.stubGlobal("fetch", async () => new Response("abc"));
    await expect(verifyStoredOriginal("https://example.test", 2)).rejects.toThrow("File size verification failed");
  });
});