function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/[\s,.;:/|()[\]{}"'`!?+-]+/)
    .filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

function tokenScore(queryToken: string, targetToken: string): number {
  if (!queryToken || !targetToken) {
    return 0;
  }

  if (targetToken === queryToken) {
    return 1;
  }

  if (targetToken.startsWith(queryToken)) {
    return 0.85;
  }

  if (targetToken.includes(queryToken)) {
    return 0.65;
  }

  // Very short query tokens produce too many accidental typo matches, so
  // only allow prefix/substring hits (above) for them.
  if (queryToken.length < 3) {
    return 0;
  }

  const lenDiff = Math.abs(queryToken.length - targetToken.length);
  if (lenDiff > 2) {
    return 0;
  }

  const distance = levenshtein(queryToken, targetToken);
  const allowedDistance = queryToken.length <= 4 ? 1 : queryToken.length <= 7 ? 2 : 3;
  if (distance > allowedDistance) {
    return 0;
  }

  const maxLen = Math.max(queryToken.length, targetToken.length);
  return Math.max(0, 0.6 - distance * 0.15) * (1 - distance / maxLen);
}

export function fuzzyScore(query: string, haystack: string): number {
  const q = normalize(query);
  const h = normalize(haystack);
  if (!q || !h) {
    return 0;
  }

  if (h === q) {
    return 1;
  }

  if (h.startsWith(q)) {
    return 0.9;
  }

  if (h.includes(q)) {
    return 0.78;
  }

  const queryTokens = tokenize(q);
  const targetTokens = tokenize(h);
  if (queryTokens.length === 0 || targetTokens.length === 0) {
    return 0;
  }

  let total = 0;
  for (const queryToken of queryTokens) {
    let best = 0;
    for (const targetToken of targetTokens) {
      best = Math.max(best, tokenScore(queryToken, targetToken));
    }
    total += best;
  }

  return total / queryTokens.length;
}
