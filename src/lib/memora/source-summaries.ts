import type { SourceCitation } from "./knowledge-source";
export const SUMMARY_MODEL = "openai/gpt-6-astra";
export type SavedSummary = {
  id: string; workspace_id: string; file_id: string; answer: string;
  citations: SourceCitation[]; evidence_chunk_ids: string[];
  generated_at: string; model: string; evidence_fingerprint: string;
  request_key: string; metadata: Record<string, string | number | boolean | null>;
};
export function validAnswerCitations(answer: string, citations: SourceCitation[]) {
  const references = [...answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
  return references.length > 0 && references.every((index) => index >= 1 && index <= citations.length);
}
export async function summaryRequestKey(workspace: string, file: string, question: string, evidence: Array<{ id: string; content: string }>) {
  const payload = JSON.stringify({ workspace, file, model: SUMMARY_MODEL, version: 1, question, evidence: evidence.map((row) => [row.id, row.content.slice(0, 5000)]) });
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload))), (x) => x.toString(16).padStart(2, "0")).join("");
}