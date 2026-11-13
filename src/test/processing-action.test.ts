import { describe, expect, it } from "vitest";
import { processingActionState } from "@/lib/memora/processing-action";
const file = { id: "file", user_id: "owner", workspace_id: "workspace", status: "Uploaded" };
describe("original processing action eligibility", () => {
  it("enables Request Processing for an Uploaded owner with membership", () => {
    expect(processingActionState(file, "owner", true, [])).toEqual({ eligible: true, job: undefined, label: "Request Processing" });
  });
  it("shows the existing active job rather than another request", () => {
    const job = { id: "job", file_id: "file", status: "Awaiting Review" };
    expect(processingActionState(file, "owner", true, [job])).toEqual({ eligible: true, job, label: "View Processing Review" });
  });
  it("disables requests without workspace membership", () => {
    expect(processingActionState(file, "owner", false, []).eligible).toBe(false);
  });
  it("disables non-Uploaded originals", () => {
    expect(processingActionState({ ...file, status: "Deleting" }, "owner", true, []).eligible).toBe(false);
  });
  it("disables non-owners and signed-out users", () => {
    expect(processingActionState(file, "other", true, []).eligible).toBe(false);
    expect(processingActionState(file, undefined, true, []).eligible).toBe(false);
  });
  it("disables originals with no workspace association", () => {
    expect(processingActionState({ ...file, workspace_id: null }, "owner", true, []).eligible).toBe(false);
  });
  it("allows a new request after rejection but treats unknown statuses as active", () => {
    expect(processingActionState(file, "owner", true, [{ id: "old", file_id: "file", status: "Rejected" }]).job).toBeUndefined();
    expect(processingActionState(file, "owner", true, [{ id: "active", file_id: "file", status: "Unrecognized" }]).job?.id).toBe("active");
  });
});