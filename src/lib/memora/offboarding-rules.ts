import type { DuplicateFile, DuplicateGroup } from "./duplicate-rules";

export function summarizeOffboarding(selectedFileIds: string[], files: DuplicateFile[], groups: DuplicateGroup[]) {
  const selected = new Set(selectedFileIds);
  const compared = new Set<string>();
  const redundant = new Set<string>();
  let nearGroups = 0;
  let exactGroups = 0;
  for (const group of groups) {
    const matches = group.matches.filter((match) => selected.has(match.file_id));
    if (!matches.length) continue;
    for (const match of matches) compared.add(match.file_id);
    if (group.method === "near-text-jaccard" && group.matches.some((match) => !selected.has(match.file_id))) nearGroups += 1;
    if (group.method === "exact-file-sha256" && group.retained_file_id && !selected.has(group.retained_file_id)) {
      exactGroups += 1;
      for (const match of matches) if (match.file_id !== group.retained_file_id) redundant.add(match.file_id);
    }
  }
  const potentialSavings = files.filter((file) => redundant.has(file.id)).reduce((sum, file) => sum + file.size_bytes, 0);
  return {
    selectedFiles: selected.size,
    comparedFiles: compared.size,
    exactGroups,
    nearGroups,
    redundantFiles: redundant.size,
    uniqueFiles: [...selected].filter((id) => !compared.has(id)),
    potentialSavings,
    deletionAuthorized: false as const,
  };
}
