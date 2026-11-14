import { describe, expect, it } from "vitest";
import { summarizeOffboarding } from "@/lib/memora/offboarding-rules";
import type { DuplicateFile, DuplicateGroup } from "@/lib/memora/duplicate-rules";

const files: DuplicateFile[] = ["employee", "retained", "unique"].map((id, index) => ({ id, name: id, size_bytes: 100 + index, sha256: null, status: "Uploaded", created_at: "2026-01-01", user_id: "owner" }));
const group: DuplicateGroup = { group_key: "exact", method: "exact-file-sha256", status: "Awaiting Review", retained_file_id: "retained", potential_savings_bytes: 100, evidence: {}, matches: [{ file_id: "employee", similarity: 1, evidence: {} }, { file_id: "retained", similarity: 1, evidence: {} }] };

describe("offboarding duplicate summary", () => {
  it("counts only employee copies with an external retained original", () => {
    const result = summarizeOffboarding(["employee", "unique"], files, [group]);
    expect(result.redundantFiles).toBe(1);
    expect(result.potentialSavings).toBe(100);
    expect(result.uniqueFiles).toEqual(["unique"]);
    expect(result.deletionAuthorized).toBe(false);
  });
  it("does not count savings when the retained copy belongs to the same inventory", () => {
    const result = summarizeOffboarding(["employee", "retained"], files, [group]);
    expect(result.potentialSavings).toBe(0);
    expect(result.redundantFiles).toBe(0);
  });
  it("does not treat near matches as redundant storage", () => {
    const near = { ...group, method: "near-text-jaccard" as const, retained_file_id: null, potential_savings_bytes: 0 };
    const result = summarizeOffboarding(["employee"], files, [near]);
    expect(result.nearGroups).toBe(1);
    expect(result.potentialSavings).toBe(0);
  });
});
