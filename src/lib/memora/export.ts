import { segments, stamp, sampleFiles } from "./data";
export function exportCsv(name = "memora-sample-report") {
  const rows = [
    ["Sample data — MEMORA", "Format", "Original size", "Status", "Knowledge assets"],
    ...sampleFiles.map((f) => [f.name, f.format, f.size, f.status, f.assets.toString()]),
  ];
  download(
    rows.map((row) => row.map((v) => `"${v.replaceAll('"', '""')}"`).join(",")).join("\n"),
    `${name}.csv`,
    "text/csv",
  );
}
export function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportTranscript(type: string) {
  if (type === "PDF") {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("MEMORA | Visual transcript", 18, 22);
    doc.setFontSize(10);
    doc.text("SAMPLE DATA — illustrative transcript; source video not connected.", 18, 32);
    let y = 49;
    for (const s of segments) {
      doc.setFontSize(13);
      doc.text(`${stamp(s.start)} | ${s.speaker} | FRAME_00${s.slide}`, 18, y);
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(`${s.title}\n${s.text}`, 170);
      doc.text(lines, 18, y + 8);
      y += lines.length * 5 + 25;
    }
    doc.save("memora-sample-transcript.pdf");
    return;
  }
  download(
    type === "JSON"
      ? JSON.stringify({ sample: true, source: "network", segments }, null, 2)
      : segments
          .map((s) => `${stamp(s.start)} ${s.speaker} [FRAME_00${s.slide}]\n${s.text}`)
          .join("\n\n"),
    `memora-sample-transcript.${type.toLowerCase()}`,
    type === "JSON" ? "application/json" : "text/plain",
  );
}
