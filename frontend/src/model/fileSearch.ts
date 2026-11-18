/**
 * Scores how well a query matches a path: every query character must appear in order. Matches in the file
 * name, at the start of a segment, or in a row score higher, and the whole query as one unbroken piece scores
 * highest. Returns -1 for no match.
 */
export function matchScore(path: string, query: string): number {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return 0;
  const p = path.toLowerCase();
  const nameStart = p.lastIndexOf('/') + 1;
  let score = 0;
  let pi = 0;
  let prev = -2;
  for (const ch of q) {
    const found = p.indexOf(ch, pi);
    if (found < 0) return -1;
    score += 1;
    if (found === prev + 1) score += 3; // consecutive
    if (found >= nameStart) score += 2; // in the file name
    if (found === 0 || p[found - 1] === '/' || p[found - 1] === '.' || p[found - 1] === '-' || p[found - 1] === '_') score += 4;
    prev = found;
    pi = found + 1;
  }
  // The whole query as one unbroken piece is what people usually mean ("router" → …/router/…).
  const whole = p.lastIndexOf(q);
  if (whole >= 0) score += q.length * 4 + (whole >= nameStart ? q.length * 2 : 0);
  return score - (p.length - q.length) * 0.02;
}

