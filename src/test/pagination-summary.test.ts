import { describe, expect, it } from "vitest";
import { latestResult, readRecordPage } from "@/lib/memora/pagination";
import { summaryRequestKey, validAnswerCitations } from "@/lib/memora/source-summaries";
describe("bounded source retrieval", () => {
  it("retrieves a 1251-segment transcript across explicit pages without retaining more than 100 rows", async () => {
    const all = Array.from({ length: 1251 }, (_, id) => ({ id }));
    const ids: number[] = [];
    for (let page = 0; ; page++) {
      const result = await readRecordPage(async (from, to) => ({ data: all.slice(from, to + 1), error: null }), page);
      expect(result.rows.length).toBeLessThanOrEqual(100);
      ids.push(...result.rows.map((r) => r.id));
      if (!result.hasNext) break;
    }
    expect(ids).toEqual(all.map((r) => r.id));
  });
  it("selects latest result independent of input order and breaks timestamp ties by ID", () => {
    const older = { id: "z", created_at: "2026-11-13" }, first = { id: "a", created_at: "2026-11-14" }, latest = { id: "b", created_at: "2026-11-14" };
    expect(latestResult([latest, older, first])).toEqual(latest);
    expect(latestResult([first, latest, older])).toEqual(latest);
  });
  it("deduplicates the same summary evidence but invalidates changed source content", async () => {
    const rows = [{ id: "chunk", content: "Original evidence" }];
    const key = await summaryRequestKey("workspace", "file", "Summarize", rows);
    expect(await summaryRequestKey("workspace", "file", "Summarize", rows)).toBe(key);
    expect(await summaryRequestKey("workspace", "file", "Summarize", [{ id: "chunk", content: "Changed evidence" }])).not.toBe(key);
  });
  it("rejects generated citation numbers absent from supplied evidence", () => {
    const citations = [{ chunkId: "chunk", fileId: "file", fileName: "Source", label: "Source page 1", to: "/documents/file?page=1" }];
    expect(validAnswerCitations("Supported [1]", citations)).toBe(true);
    expect(validAnswerCitations("Unsupported [2]", citations)).toBe(false);
    expect(validAnswerCitations("No citation", citations)).toBe(false);
  });
});