import type { LexiGroup, Translation, Word } from "@/types";

export type SuggestionKind = "definition" | "translation";

export type Suggestion = {
  /** The word that would be saved. */
  term: string;
  /** Its definition, or its translation when suggesting a pair. */
  detail: string;
  /** The book the definition came from, or undefined when AI wrote it because no enabled book had the term. */
  bookTitle?: string;
  language: string;
  /** Only set for translation suggestions. */
  targetLanguage?: string;
  /** Saved words this term was drawn from, for definition suggestions. */
  seenIn: string[];
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

export type FallbackDefinitionOptions = {
  /** The whole vocabulary, used to know what's already saved regardless of scope. */
  words: Word[];
  /** Restrict candidate-mining to one group's words, or omit for the whole vocabulary. */
  group?: LexiGroup;
  dismissed: Set<string>;
  findDefinition: DefinitionLookup;
  /** Terms to skip in addition to `dismissed`, e.g. ones another section already used. */
  exclude?: Set<string>;
  limit?: number;
};

/**
 * Offline fallback for when AI suggestions aren't available: mines terms
 * that keep appearing inside the definitions of the user's own saved words,
 * scoped to one group (or the whole vocabulary), and looks each one up in
 * the enabled books. No network, no API key, nothing beyond data already on
 * disk.
 */
export function buildFallbackDefinitionSuggestions({
  words,
  group,
  dismissed,
  findDefinition,
  exclude,
  limit = 4,
}: FallbackDefinitionOptions): Suggestion[] {
  const scopedWords = group ? words.filter((word) => (word.groupIds || []).includes(group.id)) : words;
  if (scopedWords.length === 0) return [];

  const candidates = collectCandidates(scopedWords, knownTerms(words))
    .filter((candidate) => !dismissed.has(candidate.term))
    .filter((candidate) => !exclude?.has(candidate.term));

  const picked: Suggestion[] = [];
  for (const candidate of candidates) {
    if (picked.length >= limit) break;
    const found = findDefinition(candidate.term);
    // Without a definition there is nothing to show or save, so those are
    // skipped rather than shown as a bare word.
    if (!found) continue;
    picked.push({
      term: candidate.term,
      detail: found.definition,
      bookTitle: found.bookTitle,
      language: candidate.language,
      seenIn: Array.from(candidate.seenIn).slice(0, 3),
    });
  }

  return picked;
}

export type FallbackTranslationOptions = {
  words: Word[];
  translations: Translation[];
  group?: LexiGroup;
  dismissed: Set<string>;
  findTranslation: TranslationLookup;
  exclude?: Set<string>;
  limit?: number;
};

/** Offline fallback mirror of {@link buildFallbackDefinitionSuggestions} for translations. */
export function buildFallbackTranslationSuggestions({
  words,
  translations,
  group,
  dismissed,
  findTranslation,
  exclude,
  limit = 4,
}: FallbackTranslationOptions): Suggestion[] {
  const alreadyPaired = new Set(
    translations.map((translation) => translation.sourceWord.trim().toLowerCase()),
  );

  const scopedWords = group ? words.filter((word) => (word.groupIds || []).includes(group.id)) : words;
  const untranslated = scopedWords.filter((word) => {
    const normalized = word.word.trim().toLowerCase();
    return !alreadyPaired.has(normalized) && !dismissed.has(normalized) && !exclude?.has(normalized);
  });

  const picked: Suggestion[] = [];
  for (const word of untranslated) {
    if (picked.length >= limit) break;
    const found = findTranslation(word.word);
    if (!found) continue;
    picked.push({
      term: word.word,
      detail: found.targetWord,
      bookTitle: found.bookTitle,
      language: word.language,
      targetLanguage: found.targetLanguage,
      seenIn: [],
    });
  }

  return picked;
}

export { knownTerms };
