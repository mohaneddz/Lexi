function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/[\s,.;:/|()[\]{}"'`!?+-]+/)
    .filter(Boolean);
}

function tokenScore(queryToken: string, targetToken: string): number {
  if (!queryToken || !targetToken) {
    return 0;
  }

  if (targetToken === queryToken) {
    return 1;
  }

  if (targetToken.startsWith(queryToken)) {
    return 0.78;
  }

  if (targetToken.includes(queryToken)) {
    return 0.62;
  }

  let q = 0;
  let t = 0;
  let matches = 0;
  while (q < queryToken.length && t < targetToken.length) {
    if (queryToken[q] === targetToken[t]) {
      matches += 1;
      q += 1;
    }
    t += 1;
  }

  if (matches === 0) {
    return 0;
  }

  const recall = matches / queryToken.length;
  const precision = matches / targetToken.length;
  return (recall * 0.7) + (precision * 0.3);
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
