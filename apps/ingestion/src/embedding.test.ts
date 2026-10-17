import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunkDocument, embeddingProfile, sha256 } from './embedding-profile.js';
import { createEmbedder } from './embedding-provider.js';

test('chunks preserve exact Unicode source spans and overlap, including empty documents', () => {
  const markdown = `${'a'.repeat(1999)}😀${'维修\n'.repeat(1800)}`;
  const chunks = chunkDocument(markdown);
  assert.equal(chunks[0]?.startOffset, 0);
  assert.equal(chunks.at(-1)?.endOffset, markdown.length);
  for (const [i, chunk] of chunks.entries()) {
    assert.equal(chunk.text, markdown.slice(chunk.startOffset, chunk.endOffset));
    assert.equal(chunk.contentHash, sha256(chunk.text));
    assert(chunk.text.length <= 2000);
    assert(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk.text));
    if (i) assert(chunk.startOffset < (chunks[i - 1]?.endOffset ?? 0));
  }
  assert.deepEqual(chunkDocument(' \n\t'), []);
  assert.deepEqual(
    chunkDocument('short').map((chunk) => chunk.text),
    ['short'],
  );
});

test('provider reorders results and retries transient errors only', async () => {
  const profile = embeddingProfile({});
  const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
  let attempts = 0;
  const embed = createEmbedder('synthetic-test-key', profile, {
    sleep: async () => undefined,
    fetch: async () => {
      attempts++;
      if (attempts === 1) return new Response('', { status: 429 });
      return Response.json({
        model: 'text-embedding-3-small',
        data: [
          { index: 1, embedding: vector },
          { index: 0, embedding: vector },
        ],
      });
    },
  });
  assert.equal((await embed(['one', 'two'])).length, 2);
  assert.equal(attempts, 2);
  let unauthorizedCalls = 0;
  await assert.rejects(
    createEmbedder('test', profile, {
      fetch: async () => {
        unauthorizedCalls++;
        return new Response('', { status: 401 });
      },
    })(['one']),
    /HTTP 401/,
  );
  assert.equal(unauthorizedCalls, 1);
});

test('provider rejects malformed, duplicate, zero and wrong-dimension vectors', async () => {
  const profile = embeddingProfile({});
  const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
  for (const data of [
    null,
    [{ index: 0, embedding: [1, 2] }],
    [{ index: 0, embedding: Array(1536).fill(0) }],
    [
      { index: 0, embedding: vector },
      { index: 0, embedding: vector },
    ],
  ]) {
    const embed = createEmbedder('test', profile, {
      fetch: async () => Response.json({ model: profile.model, data }),
    });
    await assert.rejects(embed(data?.length === 2 ? ['one', 'two'] : ['one']));
  }
});
