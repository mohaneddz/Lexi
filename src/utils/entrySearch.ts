import type { Translation, Word } from "@/types";
import { boundedEditDistance } from "@/utils/bookSearch";
import { descriptiveTags } from "@/utils/tags";

export type EntryKind = "word" | "translation";

export type EntrySearchResult = {
  kind: EntryKind;
  id: string;
  /** The word, or the source side of a pair. */
  term: string;
  /** The definition, or the translation. */
  meaning: string;
  /** "English", or "English to French". */
  languages: string;
  /** A context sentence or example, when there is one. */
  note: string;
  tags: string[];
  dateAdded: number;
  score: number;
};

// Accents and Arabic vowel marks are ignored on both sides, so "resume"
// finds "résumé" and a bare Arabic word finds its vocalized entry.
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯؐ-ًؚ-ٰٟـ]/g, "")
    .toLowerCase()
    .trim();
}

function isWordStart(text: string, index: number): boolean {
  return index === 0 || /[\s\-(/'"]/.test(text[index - 1]);
}

/** How well the query matches a headword: exact, then prefix, word start, anywhere, then a typo. */
function headwordScore(query: string, headword: string): number {
  if (!headword) return 0;
  if (headword === query) return 100;
  if (headword.startsWith(query)) return 88 - Math.min(10, headword.length - query.length) * 0.5;
  const index = headword.indexOf(query);
  if (index >= 0) return isWordStart(headword, index) ? 72 : 58;
  if (query.length >= 3) {
    const allowed = query.length <= 5 ? 1 : 2;
    const whole = boundedEditDistance(query, headword, allowed);
    if (whole <= allowed) return 50 - whole * 8;
    // A typo in what's typed so far: "definitoin" should still find "definition...".
    if (headword.length > query.length) {
      const prefix = boundedEditDistance(query, headword.slice(0, query.length), allowed);
      if (prefix <= allowed) return 42 - prefix * 8;
    }
  }
  return 0;
}

function scoreEntry(query: string, headwords: string[], meaning: string, extras: string[], tags: string[]): number {
  let best = 0;
  for (const headword of headwords) best = Math.max(best, headwordScore(query, fold(headword)));
  if (best >= 58) return best;
  if (tags.some((tag) => fold(tag) === query)) best = Math.max(best, 40);
  if (fold(meaning).includes(query)) best = Math.max(best, 34);
  if (extras.some((extra) => fold(extra).includes(query))) best = Math.max(best, 26);
  return best;
}

function wordResult(word: Word): Omit<EntrySearchResult, "score"> {
  return {
    kind: "word",
    id: word.id,
    term: word.word,
    meaning: word.definition,
    languages: word.language,
    note: word.examples?.[0] ?? "",
    tags: descriptiveTags(word.tags),
    dateAdded: word.dateAdded,
  };
}

function translationResult(translation: Translation): Omit<EntrySearchResult, "score"> {
  return {
    kind: "translation",
    id: translation.id,
    term: translation.sourceWord,
    meaning: translation.targetWord,
    languages: `${translation.sourceLanguage} to ${translation.targetLanguage}`,
    note: translation.context ?? "",
    tags: descriptiveTags(translation.tags),
    dateAdded: translation.dateAdded,
  };
}

/**
 * Searches every saved word and translation at once. An empty query lists
 * the most recently added entries instead, so the panel is useful before
 * anything is typed.
 */
export function searchEntries(
  rawQuery: string,
  words: Word[],
  translations: Translation[],
  options: { kind?: EntryKind | "all"; limit?: number } = {},
): EntrySearchResult[] {
  const { kind = "all", limit = 60 } = options;
  const query = fold(rawQuery);
  const results: EntrySearchResult[] = [];

  if (kind !== "translation") {
    for (const word of words) {
      const score = query ? scoreEntry(query, [word.word], word.definition, word.examples ?? [], word.tags) : 1;
      if (score > 0) results.push({ ...wordResult(word), score });
    }
  }
  if (kind !== "word") {
    for (const translation of translations) {
      // Either side of a pair counts as its headword.
      const score = query
        ? scoreEntry(query, [translation.sourceWord, translation.targetWord], "", [translation.context ?? ""], translation.tags ?? [])
        : 1;
      if (score > 0) results.push({ ...translationResult(translation), score });
    }
  }

  results.sort((a, b) => b.score - a.score || b.dateAdded - a.dateAdded || a.term.localeCompare(b.term));
  return results.slice(0, limit);
}
