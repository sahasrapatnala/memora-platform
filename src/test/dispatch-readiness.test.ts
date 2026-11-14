import { describe, expect, it } from "vitest";
import { validateDispatchReadiness } from "@/lib/memora/dispatch-readiness";
const input = {
  job: { id: "job", file_id: "file", workspace_id: "workspace", user_id: "owner", status: "Approved" },
  decision: { id: "audit", processing_job_id: "job", workspace_id: "workspace", file_id: "file", status: "Approved" },
  file: { id: "file", workspace_id: "workspace", user_id: "owner", status: "Uploaded", size_bytes: 220480662, sha256: "a".repeat(64), format: "MP4" },
  userId: "reviewer", role: "reviewer", ownerIsMember: true,
};
describe("fail-closed dispatch readiness", () => {
  it("never claims or dispatches even an approved eligible video while capabilities are missing", () => {
    expect(validateDispatchReadiness(input)).toMatchObject({ jobId: "job", dispatched: false, status: "Blocked" });
    expect(validateDispatchReadiness(input).canStart).toBe(false);
  });
  it("accepts supported document formats without claiming or dispatching", () => {
    for (const format of ["PDF", "PPTX", "DOCX"]) {
      expect(validateDispatchReadiness({ ...input, file: { ...input.file, format } }).dispatched).toBe(false);
    }
    expect(() => validateDispatchReadiness({ ...input, file: { ...input.file, format: "TXT" } })).toThrow("Verified supported original");
  });
  it("requires authenticated reviewer access", () => {
    expect(() => validateDispatchReadiness({ ...input, userId: "" })).toThrow("Reviewer access");
    expect(() => validateDispatchReadiness({ ...input, role: "member" })).toThrow("Reviewer access");
  });
  it("rejects every ineligible job state", () => {
    for (const status of ["Awaiting Review", "Rejected", "Cancelled", "Completed", "Failed"]) {
      expect(() => validateDispatchReadiness({ ...input, job: { ...input.job, status } })).toThrow();
    }
  });
  it("requires a matching processing approval", () => {
    expect(() => validateDispatchReadiness({ ...input, decision: undefined })).toThrow();
    expect(() => validateDispatchReadiness({ ...input, decision: { ...input.decision, file_id: "other" } })).toThrow();
  });
  it("revalidates original ownership, workspace, status and membership", () => {
    expect(() => validateDispatchReadiness({ ...input, ownerIsMember: false })).toThrow();
    for (const file of [{ ...input.file, user_id: "other" }, { ...input.file, workspace_id: "other" }, { ...input.file, status: "Deleted" }]) {
      expect(() => validateDispatchReadiness({ ...input, file })).toThrow();
    }
  });
  it("requires registered bounded size and SHA-256 integrity", () => {
    for (const file of [{ ...input.file, size_bytes: 0 }, { ...input.file, size_bytes: 5368709121 }, { ...input.file, sha256: null }]) {
      expect(() => validateDispatchReadiness({ ...input, file })).toThrow();
    }
  });
  it("recognizes installed video-only capabilities without enabling execution", () => {
    const result = validateDispatchReadiness({ ...input, capabilities: { schemaInstalled: true, permissionsVerified: true }, processingEnabled: false, workerConfigured: false });
    expect(result).toMatchObject({ schemaInstalled: true, permissionsVerified: true, architecture: "Video-only demo", processingEnabled: false, canStart: false, dispatched: false });
  });
  it("never allows documents through video-only readiness", () => {
    expect(validateDispatchReadiness({ ...input, capabilities: { schemaInstalled: true, permissionsVerified: true }, processingEnabled: true, workerConfigured: true, file: { ...input.file, format: "PDF" } }).canStart).toBe(false);
  });
  it("requires both permissions and execution gate for the start control", () => {
    expect(validateDispatchReadiness({ ...input, capabilities: { schemaInstalled: true, permissionsVerified: false }, processingEnabled: true, workerConfigured: true }).canStart).toBe(false);
  });
});
describe("readiness runtime reasons", () => {
  it("shows the actual non-secret runtime cause and still blocks start", () => {
    const result = validateDispatchReadiness({ ...input, processingEnabled: true, workerConfigured: true, capabilities: { schemaInstalled: false, permissionsVerified: false, reason: "Server process is missing managed Cloud binding: SUPABASE_SERVICE_ROLE_KEY" } });
    expect(result.canStart).toBe(false);
    expect(result.blockers[0]).toBe("Runtime check failed: Server process is missing managed Cloud binding: SUPABASE_SERVICE_ROLE_KEY");
  });
});
