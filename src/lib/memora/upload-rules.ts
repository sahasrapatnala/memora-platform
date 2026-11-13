export const MAX_ORIGINAL_BYTES = 5 * 1024 * 1024 * 1024;
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

export function uploadIdentity(userId: string, workspaceId: string, file: Pick<File, "name" | "size" | "lastModified">) {
  return JSON.stringify([userId, workspaceId, file.name, file.size, file.lastModified]);
}