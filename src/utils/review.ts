import type { ReviewState, Word } from "@/types";

export type ReviewStatus = "New" | "Learning" | "Mastered";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days until the next review after reaching each stage. Stage 0 is an entry
 * that has never been reviewed; every correct answer moves it up one, so a
 * word seen at the right moments reaches the monthly stage in about a month
 * rather than two lucky answers in a row.
 */
const STAGE_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60, 120];

/** The stage from which an entry counts as mastered: it has held up across a month-long gap. */
export const MASTERED_STAGE = 5;

export const MAX_STAGE = STAGE_INTERVAL_DAYS.length - 1;

type Reviewable = { review?: ReviewState };

export function reviewStateOf(entry: Reviewable): ReviewState {
  return entry.review ?? { stage: 0, dueAt: 0 };
}

export function getReviewStatus(entry: Reviewable): ReviewStatus {
  const { stage } = reviewStateOf(entry);
  if (stage <= 0) return "New";
  if (stage >= MASTERED_STAGE) return "Mastered";
  return "Learning";
}

export function isDue(entry: Reviewable, now = Date.now()): boolean {
  return reviewStateOf(entry).dueAt <= now;
}

/**
 * The next review state after an answer. A correct answer moves up a stage
 * and pushes the next review further out; a miss drops one stage and brings
 * the entry back tomorrow, rather than wiping everything learned so far.
 */
export function scheduleReview(entry: Reviewable, correct: boolean, now = Date.now()): ReviewState {
  const current = reviewStateOf(entry);
  const stage = correct ? Math.min(MAX_STAGE, current.stage + 1) : Math.max(1, current.stage - 1);
  const days = correct ? STAGE_INTERVAL_DAYS[stage] : 1;
  return {
    stage,
    dueAt: now + days * DAY_MS,
    lastReviewedAt: now,
    reviewCount: (current.reviewCount ?? 0) + 1,
    lapses: (current.lapses ?? 0) + (correct ? 0 : 1),
  };
}

/** Days until the next review if this answer is right, for showing what a correct answer earns. */
export function nextIntervalDays(entry: Reviewable): number {
  return STAGE_INTERVAL_DAYS[Math.min(MAX_STAGE, reviewStateOf(entry).stage + 1)];
}

/** "today", "tomorrow", "in 3 days", "in 2 weeks"... */
export function describeDueIn(dueAt: number, now = Date.now()): string {
  const days = Math.ceil((dueAt - now) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

// Before spaced repetition, status lived in tags. These are only read to
// convert old data, and kept out of descriptive tags.
const MASTERED_TAGS = new Set(["mastered", "learned", "fluent"]);
const LEARNING_TAGS = new Set(["learning", "review", "study"]);
const NEW_TAGS = new Set(["new", "fresh", "unseen"]);
const STATUS_TAGS = new Set([...MASTERED_TAGS, ...LEARNING_TAGS, ...NEW_TAGS]);

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/** Tags that record review progress rather than describe the entry. */
export function isReviewStatusTag(tag: string): boolean {
  return STATUS_TAGS.has(normalizeTag(tag));
}

/**
 * Turns old status tags into a review state, once, for entries saved before
 * spaced repetition. Mastered words keep their standing and come back a
 * month after they were added; learning ones are due straight away.
 */
export function reviewStateFromLegacyTags(tags: string[], dateAdded: number): ReviewState {
  const normalized = tags.map(normalizeTag);
  if (normalized.some((tag) => MASTERED_TAGS.has(tag))) {
    return { stage: MASTERED_STAGE, dueAt: dateAdded + STAGE_INTERVAL_DAYS[MASTERED_STAGE] * DAY_MS };
  }
  if (normalized.some((tag) => LEARNING_TAGS.has(tag))) {
    return { stage: 2, dueAt: 0 };
  }
  return { stage: 0, dueAt: 0 };
}

export function buildExample(word: Word): string {
  if (word.examples && word.examples.length > 0) {
    const index = Math.abs(word.word.length + word.definition.length) % word.examples.length;
    return word.examples[index];
  }

  return "";
}
