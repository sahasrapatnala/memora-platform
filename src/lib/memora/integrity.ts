export type FileMeasurement = { id: string; size_bytes: number };
export type PackageMeasurement = {
  file_id: string;
  generated_size_bytes: number;
  package_verified_at: string | null;
  reclaimed_size_bytes: number;
  retention_verified_at: string | null;
  approval_id: string | null;
  created_at: string;
};
export function measuredStorage(
  files: FileMeasurement[],
  measurements: PackageMeasurement[],
  approvedIds: string[] = [],
) {
  const latest = new Map<string, PackageMeasurement>();
  for (const row of [...measurements].sort((a, b) => a.created_at.localeCompare(b.created_at)))
    latest.set(row.file_id, row);
  let potential = 0;
  let reclaimed = 0;
  let generated = 0;
  for (const file of files) {
    const row = latest.get(file.id);
    if (!row) continue;
    if (row.package_verified_at) {
      generated += row.generated_size_bytes;
      potential += Math.max(0, file.size_bytes - row.generated_size_bytes);
    }
    if (row.retention_verified_at && row.approval_id && approvedIds.includes(row.approval_id))
      reclaimed += row.reclaimed_size_bytes;
  }
  return {
    original: files.reduce((sum, f) => sum + f.size_bytes, 0),
    generated,
    potential,
    reclaimed,
  };
}
export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}
