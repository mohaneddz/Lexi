import type { LexiGroup, Translation, Word } from "@/types";

export type SuggestionKind = "definition" | "translation";

export type Suggestion = {
  /** The word that would be saved. */
  term: string;
  /** Its definition, or its translation when suggesting a pair. */
  detail: string;
  bookTitle: string;
  language: string;
  /** Only set for translation suggestions. */
  targetLanguage?: string;
  /** Saved words this term was drawn from, for definition suggestions. */
  seenIn: string[];
};

export type SuggestionSection = {
  key: string;
  /** The group these came from, or null for the whole vocabulary. */
  group: LexiGroup | null;
  title: string;
  reason: string;
  suggestions: Suggestion[];
  /** Shown instead of entries when a group has nothing new to offer. */
  emptyNote?: string;
};

export type DefinitionLookup = (term: string) => { definition: string; bookTitle: string } | null;
export type TranslationLookup = (
  term: string,
) => { targetWord: string; targetLanguage: string; bookTitle: string } | null;

/**
 * Words too common to be worth suggesting, plus the shorthand that runs
 * through dictionary prose ("obs.", "cf.", "pl.") which would otherwise
 * dominate the counts for anyone importing from Webster's.
 */
const STOP_WORDS = new Set([
  "about", "above", "after", "again", "against", "also", "among", "another", "any", "anything",
  "are", "around", "because", "been", "before", "being", "below", "between", "both", "but",
  "called", "came", "can", "cannot", "cause", "certain", "come", "could", "did", "does", "doing",
  "done", "down", "during", "each", "either", "else", "especially", "etc", "even", "ever", "every",
  "far", "few", "for", "form", "found", "from", "further", "gave", "get", "give", "given", "goes",
  "going", "gone", "good", "great", "had", "has", "have", "having", "hence", "her", "here", "hers",
  "herself", "him", "himself", "his", "how", "however", "into", "its", "itself", "just", "keep",
  "kind", "knew", "know", "known", "large", "last", "later", "least", "less", "let", "like",
  "likely", "little", "long", "made", "make", "makes", "making", "man", "many", "may", "might",
  "more", "most", "much", "must", "near", "need", "never", "new", "next", "not", "nothing", "now",
  "off", "often", "old", "one", "only", "onto", "other", "others", "our", "ours", "out", "over",
  "own", "part", "particular", "per", "perhaps", "place", "put", "quite", "rather", "really",
  "said", "same", "say", "says", "see", "seen", "shall", "she", "should", "similar", "since",
  "small", "some", "someone", "something", "sometimes", "still", "such", "take", "taken", "than",
  "that", "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they",
  "thing", "things", "this", "those", "though", "three", "through", "thus", "time", "too", "two",
  "under", "until", "upon", "use", "used", "uses", "using", "usually", "very", "was", "way",
  "well", "were", "what", "when", "where", "whether", "which", "while", "who", "whom", "whose",
  "why", "will", "with", "within", "without", "word", "words", "would", "yet", "you", "your",
  "yours", "cf", "esp", "obs", "pl", "sing", "syn", "var", "vb", "adj", "adv", "noun", "verb",
]);

const MIN_TERM_LENGTH = 4;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z'-]+/)
    .map((token) => token.replace(/^['-]+|['-]+$/g, ""))
    .filter(Boolean);
}

/**
 * Crude suffix strip, only used to tell whether a candidate is really just a
 * word the user already saved ("abandon" vs "abandoned").
 */
function stem(term: string): string {
  for (const suffix of ["ations", "ation", "ingly", "ments", "ment", "ness", "ing", "ies", "ed", "es", "ly", "s"]) {
    if (term.length - suffix.length >= 3 && term.endsWith(suffix)) {
      return term.slice(0, -suffix.length);
    }
  }
  return term;
}

type Candidate = {
  term: string;
  seenIn: Set<string>;
  groupHits: Map<string, Set<string>>;
  language: string;
};

function collectCandidates(words: Word[], known: Set<string>): Candidate[] {
  const candidates = new Map<string, Candidate>();

  for (const word of words) {
    const text = [word.definition, ...(word.examples || [])].join(" ");
    // One vote per saved word, so a term repeated inside a single long
    // definition doesn't outrank one that keeps turning up everywhere.
    const seen = new Set(tokenize(text));

    for (const token of seen) {
      if (token.length < MIN_TERM_LENGTH) continue;
      if (STOP_WORDS.has(token)) continue;
      if (known.has(token) || known.has(stem(token))) continue;

      let candidate = candidates.get(token);
      if (!candidate) {
        candidate = { term: token, seenIn: new Set(), groupHits: new Map(), language: word.language };
        candidates.set(token, candidate);
      }

      candidate.seenIn.add(word.word);
      for (const groupId of word.groupIds || []) {
        const hits = candidate.groupHits.get(groupId) ?? new Set<string>();
        hits.add(word.word);
        candidate.groupHits.set(groupId, hits);
      }
    }
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.seenIn.size - a.seenIn.size || a.term.localeCompare(b.term));
}

function knownTerms(words: Word[]): Set<string> {
  const known = new Set<string>();
  for (const word of words) {
    const normalized = word.word.trim().toLowerCase();
    known.add(normalized);
    known.add(stem(normalized));
  }
  return known;
}

export type BuildOptions = {
  words: Word[];
  groups: LexiGroup[];
  dismissed: Set<string>;
  perSection?: number;
};

export type DefinitionOptions = BuildOptions & { findDefinition: DefinitionLookup };
export type TranslationOptions = BuildOptions & {
  translations: Translation[];
  findTranslation: TranslationLookup;
};

/**
 * Suggests words the user keeps running into but has never saved: every term
 * is drawn from the definitions of their own vocabulary, so the reason for a
 * suggestion is always something concrete they can see.
 *
 * Every group holding words gets its own section, and the sections draw from
 * independent pools — an earlier group can't use up the terms a later one
 * would have shown.
 */
export function buildDefinitionSuggestions({
  words,
  groups,
  dismissed,
  findDefinition,
  perSection = 4,
}: DefinitionOptions): SuggestionSection[] {
  if (words.length === 0) return [];

  const candidates = collectCandidates(words, knownTerms(words))
    .filter((candidate) => !dismissed.has(candidate.term));

  const toSuggestion = (candidate: Candidate, seenIn: string[]): Suggestion | null => {
    const found = findDefinition(candidate.term);
    // Without a definition there is nothing to show or save, so those are
    // skipped rather than shown as a bare word.
    if (!found) return null;
    return {
      term: candidate.term,
      detail: found.definition,
      bookTitle: found.bookTitle,
      language: candidate.language,
      seenIn: seenIn.slice(0, 3),
    };
  };

  const sections: SuggestionSection[] = [];
  const shownInGroups = new Set<string>();

  for (const group of groups) {
    const groupHasWords = words.some((word) => (word.groupIds || []).includes(group.id));
    if (!groupHasWords) continue;

    const picked: Suggestion[] = [];
    for (const candidate of candidates) {
      if (picked.length >= perSection) break;
      const hits = candidate.groupHits.get(group.id);
      if (!hits || hits.size === 0) continue;

      const suggestion = toSuggestion(candidate, Array.from(hits));
      if (!suggestion) continue;
      picked.push(suggestion);
      shownInGroups.add(candidate.term);
    }

    sections.push({
      key: `group:${group.id}`,
      group,
      title: group.name,
      reason: `Turning up in the definitions of your ${group.name} words`,
      suggestions: picked,
      emptyNote: picked.length === 0
        ? "Nothing new here yet. Every term in these definitions is already saved or dismissed."
        : undefined,
    });
  }

  // The catch-all skips anything a group already surfaced, so it adds to the
  // page instead of repeating it.
  const rest: Suggestion[] = [];
  for (const candidate of candidates) {
    if (rest.length >= perSection) break;
    if (shownInGroups.has(candidate.term)) continue;
    const suggestion = toSuggestion(candidate, Array.from(candidate.seenIn));
    if (suggestion) rest.push(suggestion);
  }

  if (rest.length > 0) {
    sections.push({
      key: "vocabulary",
      group: null,
      title: "Across your vocabulary",
      reason: "Showing up again and again in words you have already saved",
      suggestions: rest,
    });
  }

  return sections;
}

/**
 * Suggests translations for words already in the user's vocabulary that have
 * no pair yet, looked up in the enabled translation books.
 */
export function buildTranslationSuggestions({
  words,
  translations,
  groups,
  dismissed,
  findTranslation,
  perSection = 4,
}: TranslationOptions): SuggestionSection[] {
  if (words.length === 0) return [];

  const alreadyPaired = new Set(
    translations.map((translation) => translation.sourceWord.trim().toLowerCase()),
  );

  const untranslated = words.filter((word) => {
    const normalized = word.word.trim().toLowerCase();
    return !alreadyPaired.has(normalized) && !dismissed.has(normalized);
  });

  const toSuggestion = (word: Word): Suggestion | null => {
    const found = findTranslation(word.word);
    if (!found) return null;
    return {
      term: word.word,
      detail: found.targetWord,
      bookTitle: found.bookTitle,
      language: word.language,
      targetLanguage: found.targetLanguage,
      seenIn: [],
    };
  };

  const sections: SuggestionSection[] = [];
  const shownInGroups = new Set<string>();

  for (const group of groups) {
    const groupWords = untranslated.filter((word) => (word.groupIds || []).includes(group.id));
    if (!words.some((word) => (word.groupIds || []).includes(group.id))) continue;

    const picked: Suggestion[] = [];
    for (const word of groupWords) {
      if (picked.length >= perSection) break;
      const suggestion = toSuggestion(word);
      if (!suggestion) continue;
      picked.push(suggestion);
      shownInGroups.add(word.id);
    }

    sections.push({
      key: `group:${group.id}`,
      group,
      title: group.name,
      reason: `Words in ${group.name} that have no translation yet`,
      suggestions: picked,
      emptyNote: picked.length === 0
        ? "No untranslated word here is covered by your enabled translation books."
        : undefined,
    });
  }

  const rest: Suggestion[] = [];
  for (const word of untranslated) {
    if (rest.length >= perSection) break;
    if (shownInGroups.has(word.id)) continue;
    const suggestion = toSuggestion(word);
    if (suggestion) rest.push(suggestion);
  }

  if (rest.length > 0) {
    sections.push({
      key: "vocabulary",
      group: null,
      title: "Across your vocabulary",
      reason: "Saved words still waiting for a translation",
      suggestions: rest,
    });
  }

  return sections;
}
