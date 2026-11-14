import { describe, expect, it } from "vitest";
import { escapeIlike, evidenceScore, queryTerms, rankEvidence } from "@/lib/memora/knowledge-search";
import { sourceCitation } from "@/lib/memora/knowledge-source";

describe("knowledge retrieval", () => {
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
