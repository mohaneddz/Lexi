import type { Word } from "@/types";

export type ReviewStatus = "New" | "Learning" | "Mastered";

const MASTERED_TAGS = new Set(["mastered", "learned", "fluent"]);
const LEARNING_TAGS = new Set(["learning", "review", "study"]);
const NEW_TAGS = new Set(["new", "fresh", "unseen"]);

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

export function getReviewStatus(word: Word): ReviewStatus {
  const normalizedTags = word.tags.map(normalizeTag);

  if (normalizedTags.some((tag) => MASTERED_TAGS.has(tag))) {
    return "Mastered";
  }

  if (normalizedTags.some((tag) => LEARNING_TAGS.has(tag))) {
    return "Learning";
  }

  if (normalizedTags.some((tag) => NEW_TAGS.has(tag))) {
    return "New";
  }

  const hoursSinceAdded = (Date.now() - word.dateAdded) / (1000 * 60 * 60);
  if (hoursSinceAdded <= 48) {
    return "New";
  }

  return "Learning";
}

const STATUS_TAGS = new Set([...MASTERED_TAGS, ...LEARNING_TAGS, ...NEW_TAGS]);

/** Tags that record review progress rather than describe the entry. */
export function isReviewStatusTag(tag: string): boolean {
  return STATUS_TAGS.has(normalizeTag(tag));
}

export function setReviewStatus(tags: string[], status: ReviewStatus): string[] {
  const nextTags = tags.filter((tag) => !isReviewStatusTag(tag));

  switch (status) {
    case "Learning":
      nextTags.push("learning");
      break;
    case "Mastered":
      nextTags.push("mastered");
      break;
    case "New":
      nextTags.push("new");
      break;
    default:
      break;
  }

  return Array.from(new Set(nextTags));
}

export function buildPhonetic(word: string): string {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!cleaned) {
    return "unknown";
  }

  return cleaned
    .replace(/tion/g, "shun")
    .replace(/ous/g, "us")
    .replace(/([aeiouy]{1,2})/g, "-$1")
    .replace(/^-/, "")
    .slice(0, 36);
}

export function buildExample(word: Word): string {
  if (word.examples && word.examples.length > 0) {
    const index = Math.abs(word.word.length + word.definition.length) % word.examples.length;
    return word.examples[index];
  }

  return "";
}
