import { createUIMessageStream, createUIMessageStreamResponse, validateUIMessages } from 'ai';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { parametersSchema, savedViewSchema, type AgentMessage } from '../src/contracts';
import { assets } from './fixtures';
import { chatAnswer, executeRead, validateParameters } from './read';
import { sampleAnswer, sampleAssets, sampleAvailable } from './sample';

const requestId = z.string().trim().min(1).max(100);
const chatRequest = z
  .object({
    requestId,
    parameters: parametersSchema,
    messages: z.array(z.unknown()).min(1).max(100),
  })
  .strict();
const runRequest = z
  .object({ requestId, definition: savedViewSchema, parameters: parametersSchema })
  .strict();
export function createApp() {
  const app = new Hono();
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (c) => c.json({ error: 'Request exceeds 64 KiB' }, 413),
    }),
  );
  app.use('/api/*', async (c, next) => {
    const origin = c.req.header('origin');
    if (
      origin &&
      ![
        'http://127.0.0.1:3400',
        'http://localhost:3400',
        'http://127.0.0.1:3401',
        'http://localhost:3401',
      ].includes(origin)
    )
      return c.json({ error: 'Origin not allowed' }, 403);
    c.header('Cache-Control', 'no-store');
    await next();
  });
  app.get('/api/health', async (c) =>
    c.json({ status: 'ok', mode: 'fixture', sampleAvailable: await sampleAvailable() }),
  );
  app.get('/api/assets', async (c) => {
    if (c.req.query('dataset') === 'sample') {
      if (!(await sampleAvailable()))
        return c.json({ error: 'Local sample-data unavailable' }, 503);
      return c.json(await sampleAssets());
    }
    return c.json(assets);
  });
  app.post('/api/views/run', async (c) => {
    try {
      const body = runRequest.parse(await c.req.json());
      if (
        (body.parameters.dataset || 'fixture') !== (body.definition.parameters.dataset || 'fixture')
      )
        return c.json({ error: 'A saved definition cannot switch datasets' }, 400);
      if (body.parameters.dataset === 'sample') {
        if (!(await sampleAvailable()))
          return c.json({ error: 'Local sample-data unavailable' }, 503);
        const response = await sampleAnswer(body.requestId, '', body.parameters, body.definition);
        return c.json({
          ...response,
          savedView: {
            id: body.definition.id,
            revision: body.definition.revision,
            name: body.definition.name,
          },
        });
      }
      const p = validateParameters(body.parameters);
      // Definitions bind a read kind, never executable content, tool transcripts, or writes.
      return c.json(executeRead(body.requestId, body.definition.kind, p, body.definition));
    } catch {
      return c.json({ error: 'Invalid read definition, parameters, or unknown well' }, 400);
    }
  });
  app.post('/api/chat', async (c) => {
    let result;
    try {
      const body = chatRequest.parse(await c.req.json());
      if (body.parameters.dataset !== 'sample') validateParameters(body.parameters);
      const messages = await validateUIMessages<AgentMessage>({ messages: body.messages });
      const latest = [...messages].reverse().find((m) => m.role === 'user');
      const prompt = latest?.parts
        .filter((p) => p.type === 'text')
        .map((p) => (p.type === 'text' ? p.text : ''))
        .join('\n')
        .trim();
      if (!prompt || prompt.length > 12000) throw Error('A bounded user question is required');
      if (body.parameters.dataset === 'sample') {
        if (!(await sampleAvailable()))
          return c.json({ error: 'Local sample-data unavailable' }, 503);
        result = await sampleAnswer(body.requestId, prompt, body.parameters);
      } else result = chatAnswer(body.requestId, prompt, body.parameters);
    } catch {
      return c.json({ error: 'Invalid chat request, parameters, or unknown well' }, 400);
    }
    const response = result;
    const stream = createUIMessageStream<AgentMessage>({
      onError: () => 'The fixture read failed. Please retry.',
      execute: async ({ writer }) => {
        if (c.req.raw.signal.aborted) return;
        writer.write({ type: 'start', messageId: crypto.randomUUID() });
        writer.write({
          type: 'data-progress',
          transient: true,
          data: {
            requestId: response.requestId,
            label:
              response.mode === 'sample'
                ? 'Reading local sample records and document evidence…'
                : 'Reading synthetic records and validating evidence…',
          },
        });
        writer.write({ type: 'text-start', id: 'answer' });
        // The answer and visual values come from the same completed typed read.
        for (const sentence of response.answer.match(/[\s\S]{1,96}/g) || [response.answer]) {
          if (c.req.raw.signal.aborted) return;
          writer.write({ type: 'text-delta', id: 'answer', delta: sentence });
        }
        writer.write({ type: 'text-end', id: 'answer' });
        writer.write({ type: 'data-result', id: `result-${response.requestId}`, data: response });
        writer.write({ type: 'finish' });
      },
    });
    return createUIMessageStreamResponse({ stream });
  });
  app.notFound((c) => c.json({ error: 'Unknown endpoint' }, 404));
  app.onError((_error, c) => c.json({ error: 'Fixture read failed' }, 500));
  return app;
}
