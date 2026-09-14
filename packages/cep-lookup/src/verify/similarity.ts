/** Minimum similarity for two different words to count as the same word with a typo. */
const WORD_MATCH_THRESHOLD = 0.75;

/**
 * @function editDistance
 * @description Optimal string alignment distance: Levenshtein plus the transposition of
 * two adjacent characters, the most common typing slip ("Paulsita").
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let beforePrevious = new Array<number>(b.length + 1).fill(0);
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  let current = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let distance = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        distance = Math.min(distance, beforePrevious[j - 2] + 1);
      }
      current[j] = distance;
    }
    [beforePrevious, previous, current] = [previous, current, beforePrevious];
  }
  return previous[b.length];
}

/** @function stringSimilarity @description `1 - editDistance / longer length`, from 0 to 1. */
export function stringSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - editDistance(a, b) / longest;
}

function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  // In numbers and very short words every character carries meaning: "7" vs "17", "sp" vs "sc".
  if (a.length <= 2 || b.length <= 2 || /^\d+$/.test(a) || /^\d+$/.test(b)) return 0;
  const similarity = stringSimilarity(a, b);
  return similarity >= WORD_MATCH_THRESHOLD ? similarity : 0;
}

/**
 * @function tokenSimilarity
 * @description Dice coefficient over words, where a word also pairs with a slightly
 * misspelled counterpart. Extra or missing words lower the score symmetrically.
 */
export function tokenSimilarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const available = [...b];
  let matched = 0;
  for (const word of a) {
    let bestIndex = -1;
    let best = 0;
    for (let index = 0; index < available.length; index++) {
      const similarity = wordSimilarity(word, available[index]);
      if (similarity > best) {
        best = similarity;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0) {
      matched += best;
      available.splice(bestIndex, 1);
    }
  }
  return (2 * matched) / (a.length + b.length);
}

function numbersIn(tokens: readonly string[]): string {
  return tokens.filter((token) => /^\d+$/.test(token)).sort().join(" ");
}

/**
 * @function textSimilarity
 * @description Similarity of two canonical word lists, from 0 to 1.
 */
export function textSimilarity(a: readonly string[], b: readonly string[]): number {
  const words = tokenSimilarity(a, b);
  // Comparing the joined text forgives split or merged words ("Sant Ana" / "Santana"), but
  // only when both sides carry the same numbers - "7 de Setembro" is not "17 de Setembro".
  if (numbersIn(a) !== numbersIn(b)) return words;
  return Math.max(words, stringSimilarity(a.join(""), b.join("")));
}
