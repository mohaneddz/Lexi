import { isReviewStatusTag } from "@/utils/review";

/** Marks words added from Home suggestions. Kept, but doesn't count as describing the word. */
export const SUGGESTED_TAG = "suggested";

/** Tags that describe what an entry is about, leaving out review status and bookkeeping tags. */
export function descriptiveTags(tags: string[] | undefined): string[] {
  return (tags ?? []).filter((tag) => !isReviewStatusTag(tag) && tag.trim().toLowerCase() !== SUGGESTED_TAG);
}

/** Splits a comma-separated tag field, trimming each tag and dropping blanks and repeats. */
export function parseTagInput(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value.split(",")) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/** The user's tags, most used first, so the AI can reuse them instead of inventing near-duplicates. */
export function tagVocabulary(entries: Array<{ tags?: string[] }>, limit = 40): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of descriptiveTags(entry.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}
