import { describe, it, expect } from "vitest";
import { storageSavings, validateFile, segments } from "@/lib/memora/data";
describe("MEMORA accuracy rules", () => {
  it("computes potential savings as original minus retained package", () =>
    expect(storageSavings(1000, 200).savings).toBe(800));
  it("computes percentage relative to original", () =>
    expect(storageSavings(1000, 200).percentage).toBe(80));
  it("accepts all specified input formats", () => {
    for (const format of ["mp4", "mov", "mkv", "avi", "pdf", "pptx", "docx"])
      expect(validateFile(`source.${format}`, 100)).toBeNull();
  });
  it("rejects unsupported formats", () =>
    expect(validateFile("source.exe", 100)).toBe("Unsupported file format"));
  it("reuses anonymous speaker labels within a sample recording", () => {
    expect(segments[0].speaker).toBe("Speaker 1");
    expect(segments[2].speaker).toBe("Speaker 1");
  });
});
