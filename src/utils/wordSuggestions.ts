import type { LexiGroup, Word } from "@/types";

export type Suggestion = {
  term: string;
  /** Definition pulled from an enabled book, when one has the term. */
  definition?: string;
  bookTitle?: string;
  language: string;
  /** Saved words whose definitions this term showed up in. */
  seenIn: string[];
};

export type SuggestionSection = {
  key: string;
  /** The group these came from, or null for the whole vocabulary. */
  group: LexiGroup | null;
  title: string;
  reason: string;
  suggestions: Suggestion[];
};

/**
 * Words too common to be worth suggesting, plus the shorthand that runs
 * through dictionary prose ("obs.", "cf.", "pl.") which would otherwise
 * dominate the counts for anyone importing from Webster's.
 */
const STOP_WORDS = new Set([
  "about", "above", "after", "again", "against", "also", "another", "any", "anything", "are",
  "around", "because", "been", "before", "being", "below", "between", "both", "but", "called",
  "came", "can", "cannot", "certain", "come", "could", "did", "does", "doing", "done", "down",
  "during", "each", "either", "else", "especially", "etc", "even", "ever", "every", "far", "few",
  "for", "form", "found", "from", "further", "gave", "get", "give", "given", "goes", "going",
  "gone", "good", "great", "had", "has", "have", "having", "hence", "her", "here", "hers",
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
    .map((token) => token.replace(/^[''-]+|[''-]+$/g, ""))
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
  groupHits: Map<string, number>;
  language: string;
};

function collectCandidates(words: Word[], known: Set<string>): Map<string, Candidate> {
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
        candidate.groupHits.set(groupId, (candidate.groupHits.get(groupId) ?? 0) + 1);
      }
    }
  }

  return candidates;
}

export type BuildSuggestionsOptions = {
  words: Word[];
  groups: LexiGroup[];
  dismissed: Set<string>;
  /** Looks a term up in the enabled books to attach a real definition. */
  findDefinition: (term: string) => { definition: string; bookTitle: string } | null;
  perSection?: number;
};

/**
 * Suggests words the user keeps running into but has never saved: every term
 * is drawn from the definitions of their own vocabulary, so the reason for a
 * suggestion is always something concrete they can see.
 */
export function buildSuggestions({
  words,
  groups,
  dismissed,
  findDefinition,
  perSection = 4,
}: BuildSuggestionsOptions): SuggestionSection[] {
  if (words.length === 0) {
    return [];
  }

  const known = new Set<string>();
  for (const word of words) {
    const normalized = word.word.trim().toLowerCase();
    known.add(normalized);
    known.add(stem(normalized));
  }

  const candidates = Array.from(collectCandidates(words, known).values())
    .filter((candidate) => !dismissed.has(candidate.term))
    .sort((a, b) => b.seenIn.size - a.seenIn.size || a.term.localeCompare(b.term));

  const sections: SuggestionSection[] = [];
  const used = new Set<string>();

  const take = (
    key: string,
    group: LexiGroup | null,
    title: string,
    reason: string,
    pool: Candidate[],
  ) => {
    const picked: Suggestion[] = [];

    for (const candidate of pool) {
      if (picked.length >= perSection) break;
      if (used.has(candidate.term)) continue;

      const found = findDefinition(candidate.term);
      // Without a definition there is nothing to show or save, so those are
      // skipped rather than shown as a bare word.
      if (!found) continue;

      used.add(candidate.term);
      picked.push({
        term: candidate.term,
        definition: found.definition,
        bookTitle: found.bookTitle,
        language: candidate.language,
        seenIn: Array.from(candidate.seenIn).slice(0, 3),
      });
    }

    if (picked.length > 0) {
      sections.push({ key, group, title, reason, suggestions: picked });
    }
  };

  // Group sections first: they carry the clearest "why am I seeing this".
  const groupsByReach = groups
    .map((group) => ({
      group,
      pool: candidates
        .filter((candidate) => (candidate.groupHits.get(group.id) ?? 0) > 0)
        .sort((a, b) => (b.groupHits.get(group.id) ?? 0) - (a.groupHits.get(group.id) ?? 0)),
    }))
    .filter((entry) => entry.pool.length > 0)
    .sort((a, b) => b.pool.length - a.pool.length);

  for (const { group, pool } of groupsByReach) {
    take(
      `group:${group.id}`,
      group,
      group.name,
      `Turning up in the definitions of your ${group.name} words`,
      pool,
    );
  }

  take(
    "vocabulary",
    null,
    "Across your vocabulary",
    "Showing up again and again in words you have already saved",
    candidates,
  );

  return sections;
}
