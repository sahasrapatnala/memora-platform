export const RECORD_PAGE_SIZE = 100;
export function pageOffset(page: number) {
  if (!Number.isSafeInteger(page) || page < 0) throw new Error("Invalid page");
  return page * RECORD_PAGE_SIZE;
}
export function latestResult<T extends { id: string; created_at: string }>(rows: T[]): T | undefined {
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
}
// Each call retains at most one page plus one lookahead row, regardless of source length.
export async function readRecordPage<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, page: number) {
  const from = pageOffset(page);
  const result = await read(from, from + RECORD_PAGE_SIZE);
  if (result.error) throw new Error("Source records could not be loaded");
  const rows = result.data ?? [];
  return { rows: rows.slice(0, RECORD_PAGE_SIZE), hasNext: rows.length > RECORD_PAGE_SIZE, page };
}