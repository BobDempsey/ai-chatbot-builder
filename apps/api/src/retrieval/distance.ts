/**
 * Cosine distance, matching what pgvector's `<=>` operator returns, so the
 * in-memory store ranks chunks the same way the database does and a relevance
 * floor tuned against one holds for the other.
 */
export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  // A zero vector has no direction, so nothing is near it.
  if (normA === 0 || normB === 0) return 1;
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
