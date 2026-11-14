import { describe, expect, it, vi } from "vitest";
import { canReviewProcessing, canDispatchProcessing, dispatchCandidate, reviewInput, reviewProcessing } from "@/lib/memora/processing-review";

const jobId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const input = { jobId, workspaceId, decision: "Approved" as const, reason: "Approved for extraction" };
function client(data: unknown, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { rpc, value: { rpc } as unknown as Parameters<typeof reviewProcessing>[0] };
}
describe("processing decisions", () => {
  it("allows retry only after a known Processing lease expires", () => {
    const now = Date.parse("2026-11-14T10:40:00Z");
    expect(canDispatchProcessing({ status: "Processing", lease_expires_at: "2026-11-14T10:39:59Z" }, now)).toBe(true);
    expect(canDispatchProcessing({ status: "Processing", lease_expires_at: "2026-11-14T10:40:01Z" }, now)).toBe(false);
    expect(canDispatchProcessing({ status: "Processing" }, now)).toBe(false);
    expect(canDispatchProcessing({ status: "Failed" }, now)).toBe(false);
  });
  it("allows only owner and reviewer roles", () => {
    expect(canReviewProcessing("owner")).toBe(true);
    expect(canReviewProcessing("reviewer")).toBe(true);
    expect(canReviewProcessing("member")).toBe(false);
    expect(canReviewProcessing(undefined)).toBe(false);
  });
  it("rejects unauthenticated decisions before RPC", async () => {
    const c = client([]);
    await expect(reviewProcessing(c.value, "", input)).rejects.toThrow("Sign in required");
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it("fails safely when database authorization rejects a reviewer", async () => {
    const c = client(null, { code: "42501", message: "Reviewer access required" });
    await expect(reviewProcessing(c.value, "member", input)).rejects.toThrow("Decision not saved");
  });
  it("submits a valid approval through the narrow RPC", async () => {
    const c = client([{ job_id: jobId, job_status: "Approved", decision_id: "audit", reused: false }]);
    expect(await reviewProcessing(c.value, "reviewer", input)).toEqual({ jobId, status: "Approved", decisionId: "audit", reused: false });
    expect(c.rpc).toHaveBeenCalledWith("decide_processing_job", { p_job: jobId, p_workspace: workspaceId, p_decision: "Approved", p_reason: input.reason });
  });
  it("records a rejection reason", async () => {
    const c = client([{ job_id: jobId, job_status: "Rejected", decision_id: "audit", reused: false }]);
    await reviewProcessing(c.value, "reviewer", { ...input, decision: "Rejected", reason: "Wrong recording" });
    expect(c.rpc).toHaveBeenCalledWith("decide_processing_job", expect.objectContaining({ p_decision: "Rejected", p_reason: "Wrong recording" }));
  });
  it("returns repeated decisions without triggering dispatch", async () => {
    const c = client([{ job_id: jobId, job_status: "Approved", decision_id: "audit", reused: true }]);
    expect((await reviewProcessing(c.value, "reviewer", input)).reused).toBe(true);
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid decisions and missing reasons", () => {
    expect(reviewInput.safeParse({ ...input, decision: "Processing" }).success).toBe(false);
    expect(reviewInput.safeParse({ ...input, reason: " " }).success).toBe(false);
  });
  it("rejects invalid job state returned by the database", async () => {
    const c = client(null, { message: "Only Awaiting Review jobs can be decided" });
    await expect(reviewProcessing(c.value, "reviewer", input)).rejects.toThrow("Decision not saved");
  });
  it("requires a matching approved audit before producing a non-executing candidate", () => {
    const job = { id: jobId, file_id: "file", workspace_id: workspaceId, status: "Approved" };
    const audit = { id: "audit", file_id: "file", workspace_id: workspaceId, processing_job_id: jobId, status: "Approved" };
    expect(dispatchCandidate(job, audit).dispatch_status).toBe("Not connected");
    expect(() => dispatchCandidate({ ...job, status: "Awaiting Review" }, audit)).toThrow();
    expect(() => dispatchCandidate(job, { ...audit, file_id: "other" })).toThrow();
    expect(() => dispatchCandidate(job, undefined)).toThrow();
  });
});