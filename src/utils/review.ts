import type { Word } from "@/types";

export type ReviewStatus = "New" | "Learning" | "Mastered";

const MASTERED_TAGS = new Set(["mastered", "learned", "fluent"]);
const LEARNING_TAGS = new Set(["learning", "review", "study"]);

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

  const hoursSinceAdded = (Date.now() - word.dateAdded) / (1000 * 60 * 60);
  if (hoursSinceAdded <= 48) {
    return "New";
  }

  return "Learning";
}

export function setReviewStatus(tags: string[], status: ReviewStatus): string[] {
  const statusTags = new Set([...MASTERED_TAGS, ...LEARNING_TAGS, "new"]);
  const nextTags = tags.filter((tag) => !statusTags.has(normalizeTag(tag)));

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

  const definitionSnippet = word.definition.length > 96
    ? `${word.definition.slice(0, 93)}...`
    : word.definition;
  const lowerWord = word.word.toLowerCase();

  const templates = [
    `At the briefing, the speaker described the new policy as "${lowerWord}" because it was ${definitionSnippet.toLowerCase()}.`,
    `The review called the restaurant "${lowerWord}," saying the overall experience felt ${definitionSnippet.toLowerCase()}.`,
    `In the interview, she used "${lowerWord}" to explain how the situation became ${definitionSnippet.toLowerCase()}.`,
    `The report said market conditions were "${lowerWord}" after months of ${definitionSnippet.toLowerCase()}.`,
    `He chose the word "${lowerWord}" in his essay to show the mood was ${definitionSnippet.toLowerCase()}.`,
    `During the discussion, they agreed that "${lowerWord}" best captured what happened: ${definitionSnippet.toLowerCase()}.`,
  ];

  const seed = Math.abs((word.dateAdded + word.word.length + word.language.length) % templates.length);
  return templates[seed];
}
