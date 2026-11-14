export type DuplicateFile = {
  id: string; name: string; size_bytes: number; sha256: string | null;
  status: string; created_at: string; user_id: string;
};
export type ExtractedComparison = {
  file_id: string; source_type: "pdf_page" | "pptx_slide" | "video_transcript";
  source_id: string; content: string; content_sha256: string;
};
export type DuplicateMatch = {
  file_id: string; similarity: number;
  evidence: Record<string, string | number | boolean | null>;
};
export type DuplicateGroup = {
  group_key: string; method: "exact-file-sha256" | "exact-content-sha256" | "near-text-jaccard";
  status: "Awaiting Review"; retained_file_id: string | null; potential_savings_bytes: number;
  evidence: Record<string, string | number | boolean | null>; matches: DuplicateMatch[];
};

export function normalizeExtractedText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function wordShingles(value: string, size = 5) {
  const words = normalizeExtractedText(value).split(" ").filter(Boolean);
  if (words.length < size) return new Set<string>();
  return new Set(Array.from({ length: words.length - size + 1 }, (_, index) => words.slice(index, index + size).join(" ")));
}
export function jaccardSimilarity(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    groups.set(value, [...(groups.get(value) ?? []), item]);
  }
  return groups;
}

export function detectDuplicates(files: DuplicateFile[], extracted: ExtractedComparison[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const eligible = files.filter((file) => file.status === "Uploaded" && /^[0-9a-f]{64}$/.test(file.sha256 ?? ""));
  const byHash = groupBy(eligible, (file) => file.sha256!);
  for (const [hash, matches] of byHash) {
    if (matches.length < 2) continue;
    const ordered = [...matches].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    const retained = ordered[0]!;
    groups.push({
      group_key: `exact-file:${hash}`, method: "exact-file-sha256", status: "Awaiting Review",
      retained_file_id: retained.id,
      potential_savings_bytes: ordered.slice(1).reduce((sum, file) => sum + file.size_bytes, 0),
      evidence: { algorithm: "SHA-256", sha256: hash, exact_original_bytes: true },
      matches: ordered.map((file) => ({ file_id: file.id, similarity: 1, evidence: { sha256: hash } })),
    });
  }

  const byContentHash = groupBy(extracted.filter((item) => item.content_sha256 && item.content.trim()), (item) => `${item.source_type}:${item.content_sha256}`);
  for (const [key, matches] of byContentHash) {
    if (new Set(matches.map((item) => item.file_id)).size < 2) continue;
    groups.push({
      group_key: `exact-content:${key}`, method: "exact-content-sha256", status: "Awaiting Review",
      retained_file_id: null, potential_savings_bytes: 0,
      evidence: { algorithm: "SHA-256 of extracted content", automatic_deletion_safe: false },
      matches: matches.map((item) => ({ file_id: item.file_id, similarity: 1,
        evidence: { source_type: item.source_type, source_id: item.source_id, content_sha256: item.content_sha256 } })),
    });
  }

  const candidates = extracted.filter((item) => normalizeExtractedText(item.content).split(" ").length >= 20).slice(0, 500);
  const shingles = new Map(candidates.map((item) => [`${item.source_type}:${item.source_id}`, wordShingles(item.content)] as const));
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const a = candidates[left]!; const b = candidates[right]!;
      if (a.file_id === b.file_id || a.source_type !== b.source_type || a.content_sha256 === b.content_sha256) continue;
      const aSet = shingles.get(`${a.source_type}:${a.source_id}`)!;
      const bSet = shingles.get(`${b.source_type}:${b.source_id}`)!;
      const similarity = jaccardSimilarity(aSet, bSet);
      if (similarity < 0.85) continue;
      const pair = [a.source_id, b.source_id].sort();
      groups.push({
        group_key: `near-text:${a.source_type}:${pair.join(":")}`, method: "near-text-jaccard", status: "Awaiting Review",
        retained_file_id: null, potential_savings_bytes: 0,
        evidence: { algorithm: "5-word shingle Jaccard", threshold: 0.85, candidate_only: true, automatic_deletion_safe: false },
        matches: [a, b].map((item) => ({ file_id: item.file_id, similarity: Math.round(similarity * 10000) / 10000,
          evidence: { source_type: item.source_type, source_id: item.source_id, content_sha256: item.content_sha256 } })),
      });
    }
  }
  return groups;
}
