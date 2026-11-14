import { describe, expect, it } from "vitest";
import { detectDuplicates, jaccardSimilarity, normalizeExtractedText, wordShingles, type DuplicateFile } from "@/lib/memora/duplicate-rules";

const file = (id: string, hash: string, size = 100): DuplicateFile => ({ id, name: id, size_bytes: size, sha256: hash, status: "Uploaded", created_at: `2026-01-0${id === "a" ? 1 : 2}T00:00:00Z`, user_id: "owner" });
const words = (start: number, count = 30) => Array.from({ length: count }, (_, index) => `word${start + index}`).join(" ");

describe("duplicate analysis", () => {
  it("groups exact original hashes and counts only redundant whole copies", () => {
    const groups = detectDuplicates([file("a", "a".repeat(64), 100), file("b", "a".repeat(64), 150), file("c", "b".repeat(64), 900)], []);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.retained_file_id).toBe("a");
    expect(groups[0]!.potential_savings_bytes).toBe(150);
  });
  it("ignores deleted or unhashed originals", () => {
    expect(detectDuplicates([{ ...file("a", "a".repeat(64)), status: "Deleted" }, { ...file("b", "a".repeat(64)), sha256: null }], [])).toEqual([]);
  });
  it("finds identical extracted pages across files without assigning savings", () => {
    const groups = detectDuplicates([], [
      { file_id: "a", source_type: "pdf_page", source_id: "page-a", content: "Same page", content_sha256: "c".repeat(64) },
      { file_id: "b", source_type: "pdf_page", source_id: "page-b", content: "Same page", content_sha256: "c".repeat(64) },
    ]);
    expect(groups[0]!.method).toBe("exact-content-sha256");
    expect(groups[0]!.potential_savings_bytes).toBe(0);
  });
  it("labels high text overlap as a candidate, never a deletion decision", () => {
    const groups = detectDuplicates([], [
      { file_id: "a", source_type: "pptx_slide", source_id: "a1", content: words(0), content_sha256: "a".repeat(64) },
      { file_id: "b", source_type: "pptx_slide", source_id: "b1", content: words(1), content_sha256: "b".repeat(64) },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.method).toBe("near-text-jaccard");
    expect(groups[0]!.matches[0]!.similarity).toBeGreaterThan(0.85);
    expect(groups[0]!.evidence["automatic_deletion_safe"]).toBe(false);
    expect(groups[0]!.potential_savings_bytes).toBe(0);
  });
  it("does not compare short text as near duplicates", () => {
    expect(wordShingles("too short").size).toBe(0);
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });
  it("normalizes case, punctuation and Unicode width", () => {
    expect(normalizeExtractedText("ＳＴＯＲＡＧＥ,   Plan!")).toBe("storage plan");
  });
});
