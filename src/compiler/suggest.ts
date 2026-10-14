/** The closest known name to a misspelt one, if any is close enough. */
export function suggest(word: string, known: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestScore = Infinity;
  const w = word.toLowerCase();
  for (const k of known) {
    const score = distance(w, k.toLowerCase());
    if (score < bestScore) {
      best = k;
      bestScore = score;
    }
  }
  return best !== undefined && bestScore <= Math.max(2, Math.floor(word.length / 3)) ? best : undefined;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

export const didYouMean = (word: string, known: Iterable<string>) => {
  const s = suggest(word, known);
  return s ? ` (did you mean "${s}"?)` : '';
};
