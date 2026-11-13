import { describe, expect, it, vi } from "vitest";
import { createProcessingRequest, processingRequestInput } from "@/lib/memora/processing-request";

const fileId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const input = { fileId, workspaceId };
const file = { id: fileId, workspace_id: workspaceId, user_id: "owner", status: "Uploaded" };
const job = { id: "job-id", status: "Awaiting Review" };
const ok = (data: unknown) => ({ data, error: null });

function fixture(results: unknown[]) {
  const insert = vi.fn();
  const from = vi.fn(() => {
    const result = results.shift();
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not"]) chain[method] = vi.fn(() => chain);
    chain["insert"] = insert.mockImplementation(() => chain);
    chain["maybeSingle"] = vi.fn(async () => result);
    chain["single"] = vi.fn(async () => result);
    return chain;
  });
  return { client: { from } as unknown as Parameters<typeof createProcessingRequest>[0], insert, from };
}

describe("secure processing requests", () => {
  it("rejects an unauthenticated user before any database access", async () => {
    const f = fixture([]);
    await expect(createProcessingRequest(f.client, "", input)).rejects.toThrow("Sign in required");
    expect(f.from).not.toHaveBeenCalled();
  });
  it("rejects non-owners", async () => {
    const f = fixture([ok(file)]);
    await expect(createProcessingRequest(f.client, "other", input)).rejects.toThrow("Original access required");
    expect(f.insert).not.toHaveBeenCalled();
  });
  it("rejects non-Uploaded files", async () => {
    const f = fixture([ok({ ...file, status: "Deleted" })]);
    await expect(createProcessingRequest(f.client, "owner", input)).rejects.toThrow("Only Uploaded");
    expect(f.insert).not.toHaveBeenCalled();
  });
  it("requires workspace membership", async () => {
    const f = fixture([ok(file), ok(null)]);
    await expect(createProcessingRequest(f.client, "owner", input)).rejects.toThrow("Workspace access required");
    expect(f.insert).not.toHaveBeenCalled();
  });
  it("inserts exact owner, workspace and review values", async () => {
    const f = fixture([ok(file), ok({ id: "member" }), ok(null), ok(job)]);
    expect(await createProcessingRequest(f.client, "owner", input)).toEqual({ jobId: "job-id", status: "Awaiting Review", reused: false });
    expect(f.insert).toHaveBeenCalledWith({ file_id: fileId, user_id: "owner", workspace_id: workspaceId, status: "Awaiting Review", stage: "Awaiting Review", progress: null });
  });
  it("returns an existing active job without inserting", async () => {
    const f = fixture([ok(file), ok({ id: "member" }), ok(job)]);
    expect(await createProcessingRequest(f.client, "owner", input)).toEqual({ jobId: "job-id", status: "Awaiting Review", reused: true });
    expect(f.insert).not.toHaveBeenCalled();
  });
  it("returns the winner after a concurrent unique-index conflict", async () => {
    const f = fixture([ok(file), ok({ id: "member" }), ok(null), { data: null, error: { code: "23505" } }, ok(job)]);
    expect(await createProcessingRequest(f.client, "owner", input)).toEqual({ jobId: "job-id", status: "Awaiting Review", reused: true });
  });
  it("rejects malformed IDs and extra ownership inputs", () => {
    expect(processingRequestInput.safeParse({ ...input, fileId: "bad" }).success).toBe(false);
    expect(processingRequestInput.safeParse({ ...input, userId: "other" }).success).toBe(false);
  });
  it("does not return internal database error details", async () => {
    const f = fixture([ok(file), ok({ id: "member" }), ok(null), { data: null, error: { code: "42501", message: "private details" } }]);
    await expect(createProcessingRequest(f.client, "owner", input)).rejects.toThrow("Could not create processing request");
  });
});