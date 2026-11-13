import { describe, it, expect } from "vitest";
import { storageSavings, validateFile } from "@/lib/memora/data";
import { measuredStorage } from "@/lib/memora/integrity";
describe("MEMORA accuracy rules", () => {
  it("computes potential savings as original minus retained package", () =>
    expect(storageSavings(1000, 200).savings).toBe(800));
  it("computes percentage relative to original", () =>
    expect(storageSavings(1000, 200).percentage).toBe(80));
  it("accepts all specified input formats", () => {
    for (const format of ["mp4", "mov", "pdf", "pptx", "docx"])
      expect(validateFile(`source.${format}`, 100)).toBeNull();
  });
  it("rejects unsupported formats", () =>
    expect(validateFile("source.exe", 100)).toBe("Unsupported file format"));
  it("shows zero storage when there are no records", () =>
    expect(measuredStorage([], [])).toEqual({
      original: 0,
      generated: 0,
      potential: 0,
      reclaimed: 0,
    }));
  const file = { id: "source", size_bytes: 1000 };
  const measurement = {
    file_id: "source",
    generated_size_bytes: 200,
    package_verified_at: null,
    reclaimed_size_bytes: 800,
    retention_verified_at: null,
    approval_id: null,
    created_at: "2026-11-13",
  };
  it("never reports savings from an unverified package", () =>
    expect(measuredStorage([file], [measurement]).potential).toBe(0));
  it("calculates potential savings from verified bytes", () =>
    expect(
      measuredStorage([file], [{ ...measurement, package_verified_at: "2026-11-13" }]).potential,
    ).toBe(800));
  it("never counts potential savings as reclaimed", () =>
    expect(
      measuredStorage([file], [{ ...measurement, package_verified_at: "2026-11-13" }]).reclaimed,
    ).toBe(0));
  it("requires authorized approval for reclaimed bytes", () =>
    expect(
      measuredStorage(
        [file],
        [{ ...measurement, retention_verified_at: "2026-11-13", approval_id: "approval" }],
      ).reclaimed,
    ).toBe(0));
  it("counts reclaimed bytes only after verified approval", () =>
    expect(
      measuredStorage(
        [file],
        [{ ...measurement, retention_verified_at: "2026-11-13", approval_id: "approval" }],
        ["approval"],
      ).reclaimed,
    ).toBe(800));
  it("uses the latest measurement rather than double counting", () =>
    expect(
      measuredStorage(
        [file],
        [
          { ...measurement, package_verified_at: "2026-11-13" },
          {
            ...measurement,
            created_at: "2026-11-14",
            generated_size_bytes: 300,
            package_verified_at: "2026-11-14",
          },
        ],
      ).potential,
    ).toBe(700));
});
