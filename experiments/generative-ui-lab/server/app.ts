import { createUIMessageStream, createUIMessageStreamResponse, validateUIMessages } from 'ai';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { explainSnapshot } from '../src/followups.ts';
import { chatRequestSchema, type LabMessage, makeSnapshot } from '../src/protocol.ts';
import { savedRunRequestSchema } from '../src/view-contract.ts';
import { defaultPlan, getResult } from './domain.ts';
import { executeOperatorRead, operatorPlan, unsupportedReplayAnswer } from './operator.ts';
import { generatePlan, type ProviderConfig } from './provider.ts';

export function createApp(provider?: ProviderConfig) {
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
    const ports = [process.env.LAB_WEB_PORT || '3200', process.env.LAB_API_PORT || '3201'];
    if (
      origin &&
      !ports.some(
        (port) => origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`,
      )
    )
      return c.json({ error: 'Origin not allowed' }, 403);
    await next();
  });
  app.get('/api/health', (c) =>
    c.json({
      status: 'ok',
      synthetic: true,
      liveConfigured: !!provider,
      protocol: 'v0.9.1',
      catalogVersion: 1,
    }),
  );
  app.post('/api/saved-view-runs', async (c) => {
    let request: ReturnType<typeof savedRunRequestSchema.parse>;
    try {
      request = savedRunRequestSchema.parse(await c.req.json());
    } catch {
      return c.json({ error: 'Invalid saved view definition or parameters' }, 400);
    }
    if (request.fault === 'slow') {
      try {
        await new Promise<void>((resolve, reject) => {
          const signal = c.req.raw.signal;
          if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
          const finish = () => {
            signal.removeEventListener('abort', abort);
            resolve();
          };
          const timer = setTimeout(finish, 4000);
          const abort = () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          };
          signal.addEventListener('abort', abort, { once: true });
        });
      } catch {
        return c.json({ error: 'Saved view run cancelled' }, 408);
      }
    }
    if (request.fault === 'error')
      return c.json({ error: 'Injected saved view read failure. Previous result retained.' }, 503);
    const { id, revision, name, plan } = request.definition;
    return c.json(
      executeOperatorRead(request.runId, plan, request.parameters, 'local', { id, revision, name }),
    );
  });
  app.post('/api/chat', async (c) => {
    let body: ReturnType<typeof chatRequestSchema.parse>;
    let messages: LabMessage[];
    try {
      body = chatRequestSchema.parse(await c.req.json());
      messages = await validateUIMessages<LabMessage>({ messages: body.messages });
    } catch {
      return c.json({ error: 'Invalid lab chat request' }, 400);
    }
    if (body.mode === 'live' && (body.operator || body.representation === 'auto') && !provider)
      return c.json(
        {
          error:
            'Live generation is not configured. Set LAB_MODEL_BASE_URL and LAB_MODEL in the lab .env, then restart the demo backend. Offline replays remain available.',
        },
        503,
      );
    const request = body;
    const controller = new AbortController();
    c.req.raw.signal.addEventListener('abort', () => controller.abort(), { once: true });
    const signal = controller.signal;
    const delay = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const done = () => {
          signal.removeEventListener('abort', abort);
          resolve();
        };
        const timer = setTimeout(done, ms);
        const abort = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', abort, { once: true });
      });
    const stream = createUIMessageStream<LabMessage>({
      onError: () =>
        signal.aborted
          ? 'Investigation cancelled.'
          : 'Generation failed. Check the live provider configuration or select a replay.',
      execute: async ({ writer }) => {
        writer.write({ type: 'start' });
        writer.write({
          type: 'data-progress',
          transient: true,
          data: {
            runId: request.runId,
            label:
              request.mode === 'live'
                ? 'Choosing an investigation and composing views…'
                : 'Replaying a scripted investigation…',
          },
        });
        const latest = [...messages].reverse().find((m) => m.role === 'user');
        const prompt =
          latest?.parts
            .filter((p) => p.type === 'text')
            .map((p) => (p.type === 'text' ? p.text : ''))
            .join('\n') || '';
        let plan = request.operator
          ? operatorPlan(request.query, request.mode === 'replay' ? prompt : '')
          : defaultPlan(request.query);
        if (request.mode === 'live' && (request.operator || request.representation === 'auto')) {
          try {
            if (!provider) throw Error('Live provider is not configured');
            plan = await generatePlan(
              provider,
              `Current lab investigation: ${request.query}.\nVisible application context: ${JSON.stringify(request.appContext || {})}. ${request.operator ? `Operator read parameters: ${JSON.stringify(request.parameters || {})}. Deterministic reads apply these parameters after presentation selection.` : 'This context describes local filters and selection; results still cover all six wells.'} Do not invent calculations.\nUser question: ${prompt}`,
              signal,
              request.operator,
            );
          } catch (e) {
            if (signal.aborted) return;
            writer.write({
              type: 'error',
              errorText:
                e instanceof Error && /^(Live provider)/.test(e.message)
                  ? e.message
                  : 'Live provider unavailable or timed out. Previous investigation retained.',
            });
            return;
          }
        }
        if (request.representation === 'table')
          plan = { ...plan, views: ['status', 'table', 'conflicts'] };
        const generation = request.operator
          ? request.mode
          : request.representation === 'table'
            ? 'local'
            : request.mode;
        const fresh = request.operator
          ? executeOperatorRead(request.runId, plan, request.parameters, generation)
          : undefined;
        const result = fresh?.result || getResult(plan.query);
        const snapshot = (phase: 'partial' | 'ready') =>
          makeSnapshot(request.runId, plan, result, phase, generation, fresh?.execution);
        await delay(request.fault === 'slow' ? 4000 : 220);
        if (signal.aborted) return;
        writer.write({ type: 'text-start', id: 'answer' });
        writer.write({
          type: 'text-delta',
          id: 'answer',
          delta: request.operator
            ? 'Fresh synthetic fixture read. Count selects inspection rows; dates filter temperature series only. Other panels label their own source period. Compliance rules are invented; correction proposals are read-only.'
            : request.representation === 'table'
              ? 'The same validated result, shown as a table without another model call.'
              : request.mode === 'replay'
                ? 'Scripted replay using synthetic records. The views share one validated result.'
                : 'The model selected these views. Values and evidence come from deterministic synthetic queries.',
        });
        writer.write({ type: 'text-end', id: 'answer' });
        // Invalid candidates never replace the last validated canvas.
        if (['unsupported', 'bad-result', 'bad-source'].includes(request.fault)) {
          const invalid = snapshot('ready');
          if (request.fault === 'unsupported')
            invalid.wire[2] = {
              version: 'v0.9.1',
              updateComponents: {
                surfaceId: request.runId,
                components: [{ id: 'root', component: 'ExecutableHTML' }],
              },
            };
          if (request.fault === 'bad-result') invalid.result.id = 'invented-result';
          if (request.fault === 'bad-source')
            invalid.result.rows[0].sourceIds = ['invented-source'];
          writer.write({ type: 'data-surface', id: `surface-${request.runId}`, data: invalid });
          writer.write({ type: 'finish' });
          return;
        }
        if (request.fault === 'truncated') {
          writer.write({
            type: 'data-surface',
            id: `surface-${request.runId}`,
            data: { runId: request.runId, wire: '{"updateComponents":' },
          });
          writer.write({
            type: 'error',
            errorText: 'Injected interrupted update. Previous investigation retained.',
          });
          return;
        }
        if (fresh) {
          const selected =
            request.parameters?.wellId !== 'all' && request.parameters?.wellId
              ? request.parameters.wellId
              : request.appContext?.selectedWellIds[0] || result.rows[0]?.id || '';
          const explanation =
            explainSnapshot(prompt, fresh, selected) ||
            (request.mode === 'replay' ? unsupportedReplayAnswer(prompt) : null);
          if (explanation) {
            writer.write({
              type: 'data-answer',
              id: `answer-${request.runId}`,
              data: { snapshot: fresh, ...explanation },
            });
            writer.write({ type: 'finish' });
            return;
          }
        }
        writer.write({
          type: 'data-surface',
          id: `surface-${request.runId}`,
          data: snapshot('partial'),
        });
        writer.write({
          type: 'data-progress',
          transient: true,
          data: {
            runId: request.runId,
            label: 'Validated first views; adding supporting evidence and comparisons…',
          },
        });
        await delay(request.fault === 'slow' ? 4000 : 450);
        if (signal.aborted) return;
        writer.write({
          type: 'data-surface',
          id: `surface-${request.runId}`,
          data: snapshot('ready'),
        });
        writer.write({ type: 'finish' });
      },
    });
    const response = createUIMessageStreamResponse({ stream });
    // Tie consumer disconnect to the generator and provider fetch, not merely the request body.
    if (!response.body) return response;
    const reader = response.body.getReader();
    const bodyStream = new ReadableStream<Uint8Array>({
      async pull(out) {
        try {
          const part = await reader.read();
          if (part.done) out.close();
          else out.enqueue(part.value);
        } catch (e) {
          out.error(e);
        }
      },
      async cancel(reason) {
        controller.abort();
        await reader.cancel(reason).catch(() => {});
      },
    });
    return new Response(bodyStream, { status: response.status, headers: response.headers });
  });
  app.notFound((c) => c.json({ error: 'Unknown lab endpoint' }, 404));
  app.onError((_error, c) => c.json({ error: 'Demo backend request failed' }, 500));
  return app;
}
