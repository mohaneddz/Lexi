import type { BookPayload } from "@/types";

export type BookSearchRecord = {
  input: string;
  output: string;
  inputLanguage: string;
  outputLanguage: string;
};

type BookIndex = {
  records: BookSearchRecord[];
  /** Lowercased search keys. A record contributes several (term, aliases, translation target). */
  keys: string[];
  /** keys[i] belongs to records[owners[i]]. */
  owners: Int32Array;
  /** Bit i is set when keys[i] contains the letter 'a' + i. Used to reject candidates without touching the string. */
  masks: Int32Array;
  /** key length -> indices into keys, used to narrow typo candidates. */
  byLength: Map<number, number[]>;
};

const LETTER_A = 97;
const LETTER_Z = 122;

function letterMask(value: string): number {
  let mask = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= LETTER_A && code <= LETTER_Z) {
      mask |= 1 << (code - LETTER_A);
    }
  }
  return mask;
}

function popcount(value: number): number {
  let v = value - ((value >> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
  return (((v + (v >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

export type MatchKind = "exact" | "prefix" | "word" | "substring" | "typo";

export type ScoredMatch = {
  recordIndex: number;
  score: number;
  kind: MatchKind;
  keyLength: number;
};

/**
 * Indexes are derived from payload objects that stay referentially stable in
 * state, so a weak cache keeps a book's index alive exactly as long as the
 * payload it came from.
 */
const indexCache = new WeakMap<BookPayload, BookIndex>();

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isSeparator(character: string): boolean {
  return character === " " || character === "-" || character === "," || character === "(" || character === "/";
}

function buildIndex(payload: BookPayload): BookIndex {
  const records: BookSearchRecord[] = [];
  const keys: string[] = [];
  const owners: number[] = [];

  const addKey = (value: string | undefined, recordIndex: number) => {
    if (!value) return;
    const key = normalize(value);
    if (!key) return;
    keys.push(key);
    owners.push(recordIndex);
  };

  if (payload.type === "dictionary") {
    for (const entry of payload.entries) {
      const recordIndex = records.length;
      records.push({
        input: entry.term,
        output: entry.definition,
        inputLanguage: entry.language,
        outputLanguage: entry.language,
      });
      addKey(entry.term, recordIndex);
      for (const alias of entry.aliases || []) addKey(alias, recordIndex);
    }
  } else {
    for (const entry of payload.entries) {
      const recordIndex = records.length;
      records.push({
        input: entry.source,
        output: entry.target,
        inputLanguage: entry.sourceLanguage,
        outputLanguage: entry.targetLanguage,
      });
      addKey(entry.source, recordIndex);
      addKey(entry.target, recordIndex);
      for (const alias of entry.aliases || []) addKey(alias, recordIndex);
    }
  }

  const byLength = new Map<number, number[]>();
  const masks = new Int32Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    masks[i] = letterMask(key);
    const bucket = byLength.get(key.length);
    if (bucket) {
      bucket.push(i);
    } else {
      byLength.set(key.length, [i]);
    }
  }

  return { records, keys, owners: Int32Array.from(owners), masks, byLength };
}

export function getBookIndex(payload: BookPayload): BookIndex {
  const cached = indexCache.get(payload);
  if (cached) {
    return cached;
  }

  const index = buildIndex(payload);
  indexCache.set(payload, index);
  return index;
}

const MAX_TYPO_DISTANCE = 2;

/**
 * Damerau-Levenshtein distance that gives up as soon as it exceeds `max`.
 * Only the diagonal band of width 2*max+1 can hold values <= max, so the
 * inner loop stays O(max) per row instead of O(n).
 */
export function boundedEditDistance(a: string, b: string, max: number): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > max) return max + 1;
  if (m === 0) return n;
  if (n === 0) return m;

  const overflow = max + 1;
  let twoAgo: number[] = new Array<number>(n + 1).fill(overflow);
  let prev: number[] = new Array<number>(n + 1).fill(overflow);
  let curr: number[] = new Array<number>(n + 1).fill(overflow);

  for (let j = 0; j <= Math.min(n, max); j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr.fill(overflow);
    const from = Math.max(1, i - max);
    const to = Math.min(n, i + max);
    if (from === 1) curr[0] = i <= max ? i : overflow;

    let rowBest = overflow;
    for (let j = from; j <= to; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, twoAgo[j - 2] + 1);
      }
      curr[j] = value;
      if (value < rowBest) rowBest = value;
    }

    if (rowBest > max) {
      return overflow;
    }

    const spare = twoAgo;
    twoAgo = prev;
    prev = curr;
    curr = spare;
  }

  return prev[n];
}

/**
 * Relevance tiers. An exact hit always outranks a prefix hit, which always
 * outranks a match buried mid-word, which always outranks a typo guess. Within
 * a tier, the closer the candidate's length is to the query, the higher it
 * scores — so "valid" beats "validness" instead of the two tying and falling
 * back to alphabetical order.
 */
function scoreFor(kind: MatchKind, queryLength: number, keyLength: number, distance = 0): number {
  const ratio = keyLength > 0 ? Math.min(1, queryLength / keyLength) : 0;

  switch (kind) {
    case "exact":
      return 1;
    case "prefix":
      return 0.75 + 0.2 * ratio;
    case "word":
      return 0.55 + 0.15 * ratio;
    case "substring":
      return 0.4 + 0.1 * ratio;
    case "typo": {
      const base = distance <= 1 ? 0.3 : 0.18;
      const lengthPenalty = Math.abs(keyLength - queryLength) * 0.02;
      return Math.max(0.05, base - lengthPenalty);
    }
  }
}

export type MatchOptions = {
  fuzzy?: boolean;
  /** Stop looking for typo matches once this many solid hits exist. */
  typoBudget?: number;
};

/**
 * Finds the best match per record within one book.
 */
export function matchBook(index: BookIndex, query: string, options: MatchOptions = {}): ScoredMatch[] {
  const normalized = normalize(query);
  if (!normalized) {
    return [];
  }

  const { fuzzy = true, typoBudget = 40 } = options;
  const { keys, owners, masks } = index;
  const queryLength = normalized.length;
  const queryMask = letterMask(normalized);

  // Best match per record, so a record matching on both its term and an alias
  // is reported once at its strongest tier.
  const best = new Map<number, ScoredMatch>();

  const consider = (keyIndex: number, kind: MatchKind, distance = 0) => {
    const recordIndex = owners[keyIndex];
    const keyLength = keys[keyIndex].length;
    const score = scoreFor(kind, queryLength, keyLength, distance);
    const existing = best.get(recordIndex);
    if (!existing || score > existing.score) {
      best.set(recordIndex, { recordIndex, score, kind, keyLength });
    }
  };

  // Pass 1: one linear sweep covers exact, prefix and substring tiers at once.
  // A key can only contain the query if it contains every letter of it, and
  // that bitmask test is far cheaper than running indexOf on every key.
  for (let i = 0; i < keys.length; i++) {
    if ((masks[i] & queryMask) !== queryMask) {
      continue;
    }

    const key = keys[i];
    const position = key.indexOf(normalized);
    if (position === -1) {
      continue;
    }

    if (position === 0) {
      consider(i, key.length === queryLength ? "exact" : "prefix");
    } else if (isSeparator(key[position - 1])) {
      consider(i, "word");
    } else {
      consider(i, "substring");
    }
  }

  // Pass 2: typo tolerance, limited to keys within the edit-distance budget of
  // the query's length so the expensive comparison runs on a small slice.
  if (fuzzy && queryLength >= 3 && best.size < typoBudget) {
    for (let length = queryLength - MAX_TYPO_DISTANCE; length <= queryLength + MAX_TYPO_DISTANCE; length++) {
      const bucket = index.byLength.get(length);
      if (!bucket) continue;

      for (const keyIndex of bucket) {
        // Each edit can add or remove at most one distinct letter on either
        // side, so more than 2*MAX differing letters rules the candidate out
        // before the comparison runs.
        if (popcount(masks[keyIndex] ^ queryMask) > MAX_TYPO_DISTANCE * 2) continue;
        if (best.has(owners[keyIndex])) continue;
        const distance = boundedEditDistance(normalized, keys[keyIndex], MAX_TYPO_DISTANCE);
        if (distance <= MAX_TYPO_DISTANCE) {
          consider(keyIndex, "typo", distance);
        }
      }
    }
  }

  return Array.from(best.values());
}
