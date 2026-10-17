import { type CopilotMessage, chatRequestSchema, visualSchema } from '@repo/contracts';
import { fixtureText, fixtureVisual } from '@repo/contracts/fixtures';
import { createUIMessageStream, createUIMessageStreamResponse, validateUIMessages } from 'ai';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';

export const app = new Hono();

app.use('/api/*', bodyLimit({ maxSize: 65_536 }));
app.get('/api/health', (c) => c.json({ status: 'ok', mode: 'fixture' }));

app.post('/api/chat', async (c) => {
  try {
    const request = chatRequestSchema.safeParse(await c.req.json());
    if (!request.success) return c.json({ error: 'Invalid chat request.' }, 400);
    await validateUIMessages<CopilotMessage>({
      messages: request.data.messages,
      dataSchemas: { visual: visualSchema },
    });
  } catch {
    return c.json({ error: 'Invalid chat request.' }, 400);
  }

  // Replace this fixture handler on the backend branch; preserve the wire protocol.
  const stream = createUIMessageStream<CopilotMessage>({
    execute: ({ writer }) => {
      writer.write({ type: 'start' });
      writer.write({ type: 'text-start', id: 'fixture-text' });
      writer.write({ type: 'text-delta', id: 'fixture-text', delta: fixtureText });
      writer.write({ type: 'text-end', id: 'fixture-text' });
      writer.write({ type: 'data-visual', id: 'fixture-visual', data: fixtureVisual });
      writer.write({ type: 'finish' });
    },
  });
  return createUIMessageStreamResponse({ stream, headers: { 'Cache-Control': 'no-store' } });
});

app.notFound((c) => c.json({ error: 'Route not found.' }, 404));
app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }
  console.error('API request failed', error);
  return c.json({ error: 'Internal server error.' }, 500);
});
