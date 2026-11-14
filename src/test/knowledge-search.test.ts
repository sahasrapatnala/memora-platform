import { describe, expect, it } from "vitest";
import { escapeIlike, evidenceScore, queryTerms, rankEvidence, selectAnswerEvidence } from "@/lib/memora/knowledge-search";
import { sourceCitation } from "@/lib/memora/knowledge-source";

describe("knowledge retrieval", () => {
  it("summarizes real source evidence without requiring instruction keywords", () => {
    const rows = [{ content: "GraalVM compiles Java ahead of time" }];
    expect(selectAnswerEvidence(rows, "Summarize main topics and decisions", "summary")).toEqual(rows);
    expect(selectAnswerEvidence(rows, "employee salary", "answer")).toEqual([]);
  });
  it("bounds source summaries to eight distributed nonempty excerpts", () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({ content: `Page ${index}` }));
    const result = selectAnswerEvidence(rows, "summary", "summary");
    expect(result).toHaveLength(8);
    expect(result[0]).toEqual(rows[0]);
    expect(result[7]).toEqual(rows[19]);
  });
  it("ranks an exact phrase above a single common term", () => {
    expect(evidenceScore("The storage architecture decision was recorded", "storage architecture")).toBeGreaterThan(evidenceScore("storage", "storage architecture"));
  });
  it("removes question stop words and duplicate terms", () => {
    expect(queryTerms("What did the storage team say about storage?")).toEqual(["storage", "team", "say"]);
  });
  it("returns no evidence when no terms match", () => {
    expect(rankEvidence([{ content: "unrelated text" }], "database latency")).toEqual([]);
  });
  it("escapes wildcard characters in substring searches", () => {
    expect(escapeIlike("100%_done\\")).toBe("100\\%\\_done\\\\");
  });
  it("creates timestamp, page and slide source links", () => {
    const base = { id: "chunk", file_id: "file" };
    expect(sourceCitation({ ...base, source_reference: { type: "video_segment", start_seconds: 72 } }, "Video").to).toBe("/videos/file?t=72");
    expect(sourceCitation({ ...base, source_reference: { type: "document_page", page_number: 4 } }, "PDF").to).toBe("/documents/file?page=4");
    expect(sourceCitation({ ...base, source_reference: { type: "document_slide", slide_number: 7 } }, "Slides").to).toBe("/documents/file?slide=7");
  });
});
