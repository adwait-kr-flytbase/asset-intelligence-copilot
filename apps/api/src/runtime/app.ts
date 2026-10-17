import { type CopilotMessage, chatRequestSchema, visualSchema } from '@repo/contracts';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type LanguageModel,
  validateUIMessages,
} from 'ai';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { runCoordinator } from '../agents/coordinator.js';
import type { EvidenceService } from '../evidence/service.js';

/** Independent app; existing fixture server and shared wire definitions stay untouched. */
export function createAgentApp(config: {
  model: () => LanguageModel;
  evidence: EvidenceService;
  timeoutMs?: number;
}) {
  const app = new Hono();
  let active = 0;
  app.use('/api/*', bodyLimit({ maxSize: 65_536 }));
  app.get('/api/health', (c) =>
    c.json({ status: 'ok', mode: 'read-only-evidence', persistence: false }),
  );
  app.post('/api/chat', async (c) => {
    // Local CLI/development endpoint. Cross-origin browser integration needs an explicit contract handoff.
    if (c.req.header('Origin'))
      return c.json(
        { error: 'Browser integration is not enabled for this development runtime.' },
        403,
      );
    if (active >= 2) return c.json({ error: 'Investigation capacity reached.' }, 429);
    let messages: { role: 'user' | 'assistant'; content: string }[];
    try {
      const request = chatRequestSchema.parse(await c.req.json());
      if (request.messages.length > 20) throw new Error('History limit.');
      const validated = await validateUIMessages<CopilotMessage>({
        messages: request.messages,
        dataSchemas: { visual: visualSchema },
      });
      messages = validated
        .map((message) => {
          if (message.role !== 'user' && message.role !== 'assistant')
            throw new Error('Invalid role.');
          // Client-carried tool results/citations are never execution evidence for this run.
          const content = message.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('\n');
          return { role: message.role, content };
        })
        .filter((message) => message.content.trim());
      if (!messages.length || messages.at(-1)?.role !== 'user')
        throw new Error('User turn required.');
    } catch {
      return c.json({ error: 'Invalid chat request.' }, 400);
    }
    let model: LanguageModel;
    try {
      model = config.model();
    } catch {
      return c.json({ error: 'Model is not configured.' }, 503);
    }
    active++;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, c.req.raw.signal]);
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 60_000);
    const stream = createUIMessageStream<CopilotMessage>({
      execute: async ({ writer }) => {
        writer.write({ type: 'start' });
        try {
          const result = await runCoordinator(messages, {
            model,
            evidence: config.evidence,
            signal,
            onEvent(event) {
              if (event.type === 'tool-start')
                writer.write({
                  type: 'tool-input-available',
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  input: event.input,
                  dynamic: true,
                });
              else if (event.type === 'tool-result')
                writer.write({
                  type: 'tool-output-available',
                  toolCallId: event.toolCallId,
                  output: event.output,
                  dynamic: true,
                });
              else
                writer.write({
                  type: 'tool-output-error',
                  toolCallId: event.toolCallId,
                  errorText: event.error,
                  dynamic: true,
                });
            },
          });
          for (const source of result.sources)
            writer.write({
              type: 'source-document',
              sourceId: source.id,
              mediaType: 'text/plain',
              title: `${source.label} (${source.path})`,
              filename: source.path,
            });
          writer.write({ type: 'text-start', id: result.runId });
          writer.write({ type: 'text-delta', id: result.runId, delta: result.text });
          writer.write({ type: 'text-end', id: result.runId });
          for (const visual of result.visuals)
            writer.write({
              type: 'data-visual',
              id: `${result.runId}:${visual.assetId}`,
              data: visual,
            });
          writer.write({ type: 'finish', finishReason: 'stop' });
        } catch {
          writer.write({
            type: 'error',
            errorText: signal.aborted
              ? 'Investigation cancelled or timed out.'
              : 'Investigation incomplete. Evidence or model validation failed; no final answer was published.',
          });
          writer.write({ type: 'finish', finishReason: 'error' });
        } finally {
          clearTimeout(timer);
          active--;
        }
      },
      onError: () => 'Investigation failed.',
    });
    // Cancelling the HTTP consumer must also cancel provider/tool work.
    const reader = stream.getReader();
    const cancellable = new ReadableStream({
      async pull(output) {
        const item = await reader.read();
        if (item.done) output.close();
        else output.enqueue(item.value);
      },
      async cancel() {
        controller.abort();
        await reader.cancel();
      },
    });
    return createUIMessageStreamResponse({
      stream: cancellable,
      headers: { 'Cache-Control': 'no-store' },
    });
  });
  app.notFound((c) => c.json({ error: 'Route not found.' }, 404));
  app.onError((error, c) =>
    error instanceof HTTPException
      ? c.json({ error: error.message }, error.status)
      : c.json({ error: 'Internal server error.' }, 500),
  );
  return app;
}
