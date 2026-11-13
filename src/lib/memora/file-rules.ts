export function canDeleteOriginal(ownerId: string, userId: string, confirmed: boolean) {
  return confirmed && ownerId === userId;
}
export function filterOriginals<T extends { name: string; format: string; status: string }>(files: T[], search: string, format: string) {
  return files.filter((file) => file.status !== "Deleted" && file.name.toLowerCase().includes(search.trim().toLowerCase()) && (format === "All formats" || file.format === format));
}