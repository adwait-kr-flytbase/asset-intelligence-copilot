import { createHash } from 'node:crypto';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const chunker = 'utf16-window-2000-overlap-200-v1';
export function embeddingProfile(env: NodeJS.ProcessEnv = process.env) {
  const model = env.OPENROUTER_EMBEDDING_MODEL?.trim() || 'openai/text-embedding-3-small';
  const dimensions = Number(env.OPENROUTER_EMBEDDING_DIMENSIONS || 1536);
  if (model !== 'openai/text-embedding-3-small' || dimensions !== 1536)
    throw new Error('Supported embedding profile: openai/text-embedding-3-small, 1536 dimensions.');
  const config = { provider: 'openrouter', model, dimensions, chunker };
  return { id: sha256(JSON.stringify(config)), ...config };
}

/** Offsets are UTF-16 code units into the exact stored Markdown, end exclusive. */
export function chunkDocument(markdown: string) {
  const chunks: {
    chunkIndex: number;
    startOffset: number;
    endOffset: number;
    text: string;
    contentHash: string;
  }[] = [];
  if (!markdown.trim()) return chunks;
  let start = 0;
  const insidePair = (offset: number) =>
    offset > 0 &&
    offset < markdown.length &&
    /[\uD800-\uDBFF]/.test(markdown[offset - 1] ?? '') &&
    /[\uDC00-\uDFFF]/.test(markdown[offset] ?? '');
  while (start < markdown.length) {
    let end = Math.min(start + 2000, markdown.length);
    if (insidePair(end)) end--;
    const text = markdown.slice(start, end);
    chunks.push({
      chunkIndex: chunks.length,
      startOffset: start,
      endOffset: end,
      text,
      contentHash: sha256(text),
    });
    if (end === markdown.length) break;
    start = end - 200;
    if (insidePair(start)) start--;
  }
  return chunks;
}
