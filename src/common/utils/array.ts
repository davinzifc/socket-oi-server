export function chunkArray<T>(array: T[], size: number): T[][] {
  if (!Array.isArray(array)) return [];
  const n = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += n) {
    chunks.push(array.slice(i, i + n));
  }
  return chunks;
}

