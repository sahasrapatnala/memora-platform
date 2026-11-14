import { afterEach, describe, expect, it, vi } from "vitest";
import { requireWorkerReady } from "@/lib/memora/worker-readiness.server";

afterEach(() => vi.unstubAllGlobals());
describe("local demo worker admission preflight", () => {
  it("uses authenticated readiness without redirecting the private credential", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ service: "memora-processor", ready: true })));
    vi.stubGlobal("fetch", request);
    await requireWorkerReady("https://worker.example.test", "unit-test-only");
    expect(request).toHaveBeenCalledWith(new URL("https://worker.example.test/ready"), expect.objectContaining({
      headers: { Authorization: "Bearer unit-test-only" }, redirect: "error",
    }));
  });
  it.each([503, 401])("rejects HTTP %i before a job can be claimed", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status })));
    await expect(requireWorkerReady("https://worker.example.test", "unit-test-only")).rejects.toThrow("no job was claimed");
  });
  it("requires true readiness from the expected worker rather than health or a tunnel interstitial", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ service: "memora-processor", ready: false }))));
    await expect(requireWorkerReady("https://worker.example.test", "unit-test-only")).rejects.toThrow("not ready");
  });
});