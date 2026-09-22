function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// Optimal-string-alignment (Damerau-Levenshtein) distance: like Levenshtein
// but also counts an adjacent-character swap ("recieve" -> "receive") as a
// single edit instead of two, since that's the most common real typo.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[m][n];
}

// Maximum number of single-character edits (insert/delete/substitute) a
// candidate is allowed to differ from the query by. Anything further apart
// is treated as unrelated rather than "fuzzy close".
const MAX_EDIT_DISTANCE = 2;

/**
 * Scores how close `target` (a single word/term) is to `query`, in [0, 1].
 * 1 = exact match. Ranked strictly by edit distance, closest first; longer
 * length differences push the score down further even at the same distance.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = normalize(query);
  const t = normalize(target);
  if (!q || !t) {
    return 0;
  }

  if (q === t) {
    return 1;
  }

  const lenDiff = Math.abs(q.length - t.length);
  if (lenDiff > MAX_EDIT_DISTANCE) {
    return 0;
  }

  const distance = levenshtein(q, t);
  if (distance > MAX_EDIT_DISTANCE) {
    return 0;
  }

  const distancePenalty = distance / (MAX_EDIT_DISTANCE + 1);
  const lengthPenalty = lenDiff / (Math.max(q.length, t.length) + 1);
  const score = 1 - distancePenalty * 0.75 - lengthPenalty * 0.25;
  return Math.max(0, score);
}

/**
 * Best fuzzy score of `query` against any of `candidates` (terms/aliases).
 */
export function bestFuzzyScore(query: string, candidates: string[]): number {
  let best = 0;
  for (const candidate of candidates) {
    const score = fuzzyScore(query, candidate);
    if (score > best) {
      best = score;
    }
  }
  return best;
}
