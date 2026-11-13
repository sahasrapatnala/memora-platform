import { download as save } from "./export-download";
export { download } from "./export-download";
export function exportCsv(
  files: {
    name: string;
    format: string;
    size_bytes: number;
    status: string;
    sha256: string | null;
    created_at: string;
  }[],
  name = "memora-file-inventory",
) {
  if (!files.length) throw new Error("No files available to export");
  const rows = [
    ["Original file", "Format", "Size bytes", "Registration status", "SHA-256", "Uploaded"],
    ...files.map((f) => [
      f.name,
      f.format,
      String(f.size_bytes),
      f.status,
      f.sha256 ?? "",
      f.created_at,
    ]),
  ];
  save(
    rows
      .map((row) =>
        row.map((v) => `"${(/^[=+@-]/.test(v) ? "'" + v : v).replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n"),
    `${name}.csv`,
    "text/csv;charset=utf-8",
  );
}
