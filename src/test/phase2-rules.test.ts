import { describe, expect, it } from "vitest";
import { canDeleteOriginal, filterOriginals } from "@/lib/memora/file-rules";
import { validateFile } from "@/lib/memora/data";
describe("Phase 2 original rules", () => {
  it("requires explicit deletion confirmation", () => expect(canDeleteOriginal("owner", "owner", false)).toBe(false));
  it("rejects deletion by a different user", () => expect(canDeleteOriginal("owner", "other", true)).toBe(false));
  it("allows confirmed owner deletion", () => expect(canDeleteOriginal("owner", "owner", true)).toBe(true));
  it("accepts MP4 MOV PDF PPTX DOCX", () => { for (const format of ["MP4", "MOV", "PDF", "PPTX", "DOCX"]) expect(validateFile(`file.${format}`, 100)).toBeNull(); });
  it("caps originals at 50 MB", () => { expect(validateFile("a.pdf", 52428800)).toBeNull(); expect(validateFile("a.pdf", 52428801)).not.toBeNull(); });
  it("rejects empty originals", () => expect(validateFile("a.pdf", 0)).not.toBeNull());
  it("hides deleted files and combines filename and format filters", () => expect(filterOriginals([{ name: "Q4.pdf", format: "PDF", status: "Uploaded" }, { name: "Q4.pptx", format: "PPTX", status: "Uploaded" }, { name: "old.pdf", format: "PDF", status: "Deleted" }], "q4", "PDF")).toEqual([{ name: "Q4.pdf", format: "PDF", status: "Uploaded" }]));
});