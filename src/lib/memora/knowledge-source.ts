import type { Json } from "@/integrations/supabase/types";
import { stamp } from "./data";

export type SourceCitation = {
  chunkId: string;
  fileId: string;
  fileName: string;
  label: string;
  to: string;
  startSeconds?: number;
};

export function sourceCitation(
  chunk: { id: string; file_id: string; source_reference: Json },
  fileName: string,
): SourceCitation {
  const reference = typeof chunk.source_reference === "object" && chunk.source_reference !== null && !Array.isArray(chunk.source_reference)
    ? chunk.source_reference as Record<string, Json | undefined>
    : {};
  const type = typeof reference["type"] === "string" ? reference["type"] : "knowledge";
  if (type === "video_segment") {
    const seconds = typeof reference["start_seconds"] === "number" ? reference["start_seconds"] : 0;
    return { chunkId: chunk.id, fileId: chunk.file_id, fileName,
      label: `${fileName} · ${stamp(Math.floor(seconds))}`, to: `/videos/${chunk.file_id}?t=${seconds}`, startSeconds: seconds };
  }
  if (type === "document_page") {
    const page = typeof reference["page_number"] === "number" ? reference["page_number"] : 1;
    return { chunkId: chunk.id, fileId: chunk.file_id, fileName,
      label: `${fileName} · Page ${page}`, to: `/documents/${chunk.file_id}?page=${page}` };
  }
  if (type === "document_slide") {
    const slide = typeof reference["slide_number"] === "number" ? reference["slide_number"] : 1;
    return { chunkId: chunk.id, fileId: chunk.file_id, fileName,
      label: `${fileName} · Slide ${slide}`, to: `/documents/${chunk.file_id}?slide=${slide}` };
  }
  return { chunkId: chunk.id, fileId: chunk.file_id, fileName, label: fileName, to: "/knowledge" };
}
