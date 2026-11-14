const STOP_WORDS = new Set(["the", "a", "an", "and", "or", "of", "in", "on", "to", "what", "which", "were", "was", "is", "are", "did", "about", "for", "with", "this", "that"]);

export function queryTerms(query: string) {
  return Array.from(new Set(query.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? []))
    .filter((term) => !STOP_WORDS.has(term)).slice(0, 12);
}

export function evidenceScore(content: string, query: string) {
  const normalized = content.toLowerCase();
  const phrase = query.trim().toLowerCase();
  let score = phrase.length >= 3 && normalized.includes(phrase) ? 100 : 0;
  for (const term of queryTerms(query)) {
    if (!normalized.includes(term)) continue;
    score += 10;
    score += Math.min(5, normalized.split(term).length - 1);
  }
  return score;
}

export function rankEvidence<T extends { content: string }>(rows: T[], query: string, limit = 12) {
  return rows.map((row) => ({ row, score: evidenceScore(row.content, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.row);
}

export function escapeIlike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function selectAnswerEvidence<T extends { content: string }>(rows: T[], question: string, mode: "answer" | "summary") {
  // Summaries must not require the source to literally say “summarize” or “action items”.
  const nonempty = rows.filter((row) => row.content.trim());
  if (mode === "answer") return rankEvidence(nonempty, question, 8);
  if (nonempty.length <= 8) return nonempty;
  return Array.from({ length: 8 }, (_, index) => nonempty[Math.floor(index * (nonempty.length - 1) / 7)])
    .filter((row): row is T => row !== undefined);
}
