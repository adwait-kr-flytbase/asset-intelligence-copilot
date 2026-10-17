import { randomUUID } from 'node:crypto';
import {
  type ApplicationMessage,
  type ApplicationResult,
  applicationChatRequestSchema,
  applicationResultSchema,
  type ReadRecipe,
  readParametersSchema,
  readRecipeSchema,
  type SavedViewDefinition,
  savedViewDefinitionSchema,
} from '@repo/contracts';
import type { DatabaseConnection } from '@repo/db';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { ZodError, z } from 'zod';
import type { createApplicationData } from './data.js';
import { withLocationRecipe } from './location-panel.js';
import type {
  AgentRunner,
  ApplicationReadOutput,
  ExecutionContext,
  ReadExecutor,
} from './ports.js';
import {
  type Actor,
  ApplicationError,
  createApplicationRepository,
  hashInput,
  type RunRow,
} from './repository.js';
import { createDemoSession } from './session.js';
import { combineViewComponents, resolveViewComponents } from './view-composition.js';

const requestId = z.string().trim().min(1).max(128);
const listQuery = z.object({
  after: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const overrideSchema = z
  .object({
    scope: readParametersSchema.shape.scope.optional(),
    assetIds: readParametersSchema.shape.assetIds,
    window: readParametersSchema.shape.window.optional(),
    limit: z.number().int().min(1).max(500).optional(),
    equipmentKind: z.string().min(1).max(80).optional(),
  })
  .strict();
const readBody = z
  .object({
    requestId,
    panels: z
      .array(
        z
          .object({
            id: z.string().min(1).max(128),
            title: z.string().min(1).max(200),
            recipe: readRecipeSchema,
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
const refreshBody = z
  .object({
    requestId,
    parameters: overrideSchema.default({}),
    panelIds: z.array(z.string().min(1).max(128)).min(1).max(8).optional(),
  })
  .strict();

export function createApplicationApp(config: {
  connection: DatabaseConnection;
  data: ReturnType<typeof createApplicationData>;
  agent: AgentRunner;
  namespace: string;
  sessionSecret: string;
  read?: ReadExecutor;
  asOf?: string;
  timeoutMs?: number;
  maxActive?: number;
  allowedOrigins?: string[];
}) {
  const app = new Hono();
  const repository = createApplicationRepository(config.connection);
  const sessions = createDemoSession(config.sessionSecret, config.namespace);
  const active = new Map<
    string,
    { controller: AbortController; ownerId: string; kind: 'chat' | 'read' }
  >();
  const clock = () => config.asOf ?? new Date().toISOString();
  const context = (actor: Actor, signal: AbortSignal, asOf: string): ExecutionContext => ({
    ...actor,
    signal,
    asOf,
  });
  const asError = (error: unknown) =>
    error instanceof ApplicationError
      ? error
      : error instanceof ZodError || error instanceof SyntaxError
        ? new ApplicationError(400, 'INVALID_REQUEST', 'Request validation failed.')
        : new ApplicationError(
            503,
            'EXECUTION_FAILED',
            'Execution failed; no final result was published.',
          );
  const runDto = async (actor: Actor, row: RunRow) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    conversationId: row.conversationId,
    viewId: row.viewId,
    viewRevision: row.viewRevision,
    requestId: row.requestId,
    asOf: row.asOf.toISOString(),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    errorCode: row.errorCode,
    resultId: (await repository.forRun(actor, row.id))?.id ?? null,
  });
  function resultPayload(
    run: RunRow,
    output: ApplicationReadOutput,
    text: string,
    agentExecutionId?: string,
  ): ApplicationResult {
    return applicationResultSchema.parse({
      schemaVersion: 1,
      id: randomUUID(),
      runId: run.id,
      ...(run.conversationId ? { conversationId: run.conversationId } : {}),
      kind: run.kind,
      text,
      ...output,
      asOf: run.asOf.toISOString(),
      evaluatedAt: new Date().toISOString(),
      basisRevision: hashInput({
        sources: output.evidence
          .map((source) => ({ id: source.id, version: source.sourceVersionId }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        recipes: output.panels.map((panel) => panel.recipe),
        asOf: run.asOf.toISOString(),
      }),
      ...(agentExecutionId ? { agentExecutionId } : {}),
    });
  }
  const overrides = (
    panels: { id: string; title: string; recipe: ReadRecipe }[],
    input: z.infer<typeof refreshBody>,
  ) => {
    const selected = input.panelIds
      ? panels.filter((panel) => input.panelIds?.includes(panel.id))
      : panels;
    if (
      !selected.length ||
      input.panelIds?.some((id) => !selected.some((panel) => panel.id === id))
    )
      throw new ApplicationError(
        422,
        'UNSUPPORTED_REFRESH',
        'Selected panels have no approved read binding.',
      );
    return selected.map((panel) => ({
      ...panel,
      recipe: readRecipeSchema.parse({
        ...panel.recipe,
        parameters: {
          ...panel.recipe.parameters,
          ...input.parameters,
          ...(input.parameters.scope && !input.parameters.assetIds ? { assetIds: undefined } : {}),
        },
      }),
    }));
  };
  async function readRun(
    actor: Actor,
    input: z.infer<typeof readBody> & {
      viewId?: string;
      viewRevision?: number;
      kind?: 'read' | 'saved-view';
    },
    requestSignal?: AbortSignal,
  ) {
    const admission = await repository.admit(actor, {
      requestId: input.requestId,
      kind: input.kind ?? 'read',
      payload: { panels: input.panels },
      viewId: input.viewId,
      viewRevision: input.viewRevision,
      asOf: clock(),
    });
    if (admission.replay) {
      const previous = await repository.forRun(actor, admission.run.id);
      if (previous) return { run: await runDto(actor, admission.run), result: previous };
      throw new ApplicationError(
        409,
        'RUN_ALREADY_EXISTS',
        `Request already has a ${admission.run.status} run (${admission.run.id}).`,
      );
    }
    if (
      [...active.values()].filter((item) => item.kind === 'read').length >= (config.maxActive ?? 4)
    ) {
      await repository.finish(actor, admission.run.id, 'failed', 'CAPACITY');
      throw new ApplicationError(429, 'CAPACITY', 'Application capacity reached.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 120000);
    const signal = requestSignal
      ? AbortSignal.any([controller.signal, requestSignal])
      : controller.signal;
    active.set(admission.run.id, { controller, ownerId: actor.ownerId, kind: 'read' });
    try {
      const output = await (config.read ?? config.data.read)(
        input.panels,
        context(actor, signal, admission.run.asOf.toISOString()),
      );
      signal.throwIfAborted();
      const accepted = resultPayload(admission.run, output, '');
      if (!(await repository.complete(actor, admission.run.id, accepted, null)))
        throw new ApplicationError(409, 'RUN_CANCELLED', 'Run is no longer active.');
      return {
        run: await runDto(actor, await repository.run(actor, admission.run.id)),
        result: accepted,
      };
    } catch (error) {
      await repository.finish(
        actor,
        admission.run.id,
        signal.aborted ? 'cancelled' : 'failed',
        signal.aborted ? 'CANCELLED' : 'READ_FAILED',
      );
      throw asError(error);
    } finally {
      clearTimeout(timer);
      active.delete(admission.run.id);
    }
  }
  app.use('/api/*', bodyLimit({ maxSize: 65536 }));
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Request-ID', randomUUID());
    const origin = c.req.header('Origin');
    if (origin && !['GET', 'HEAD'].includes(c.req.method)) {
      const allowed = config.allowedOrigins ?? [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3003',
        'http://127.0.0.1:3003',
      ];
      if (!allowed.includes(origin))
        throw new ApplicationError(403, 'ORIGIN_DENIED', 'Origin is not allowed.');
    }
    if (
      ['POST', 'PATCH', 'PUT'].includes(c.req.method) &&
      !c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')
    )
      throw new HTTPException(415, { message: 'JSON content type is required.' });
    await next();
  });
  app.get('/api/health', (c) =>
    c.json({ status: 'ok', mode: 'application', persistence: true, identityMode: 'demo-persona' }),
  );
  app.get('/api/personas', async (c) =>
    c.json({
      ...(await config.data.personas(config.namespace, listQuery.parse(c.req.query()))),
      identityMode: 'demo-persona',
    }),
  );
  app.get('/api/session', async (c) => {
    const actor = sessions.actor(c);
    const persona = actor ? await config.data.persona(config.namespace, actor.ownerId) : null;
    return c.json({
      identityMode: 'demo-persona',
      persona: persona ?? null,
      namespace: config.namespace,
      capabilities: {
        chat: true,
        persistence: true,
        evidence: true,
        savedViews: true,
        readRefresh: true,
        maps: true,
        sharedWrites: false,
        productionAuthentication: false,
        privateRecall: 'references-only',
        resultSchemaVersions: [1],
        panels: ['status', 'table', 'ranking', 'series', 'geo', 'matrix'],
      },
    });
  });
  app.post('/api/session/persona', async (c) => {
    const { personaId } = z
      .object({ personaId: z.string().min(1).max(128) })
      .strict()
      .parse(await c.req.json());
    const persona = await config.data.persona(config.namespace, personaId);
    if (!persona) throw new ApplicationError(404, 'NOT_FOUND', 'Persona not found.');
    sessions.select(c, persona.id);
    return c.json({ persona, identityMode: 'demo-persona' });
  });
  app.get('/api/areas', async (c) => {
    sessions.require(c);
    return c.json(await config.data.areas(config.namespace, listQuery.parse(c.req.query())));
  });
  app.get('/api/assets', async (c) => {
    sessions.require(c);
    const query = listQuery
      .extend({
        area: z.string().min(1).max(128).optional(),
        search: z.string().trim().max(200).optional(),
        after: z.string().min(1).max(128).optional(),
      })
      .parse(c.req.query());
    return c.json(await config.data.assets(config.namespace, query));
  });
  app.post('/api/conversations', async (c) => {
    const actor = sessions.require(c);
    const { title } = z
      .object({ title: z.string().trim().min(1).max(200).default('New conversation') })
      .strict()
      .parse(await c.req.json());
    return c.json(await repository.createConversation(actor, title), 201);
  });
  app.get('/api/conversations', async (c) => {
    const actor = sessions.require(c);
    const query = listQuery.parse(c.req.query());
    return c.json(await repository.listConversations(actor, query.after, query.limit));
  });
  app.get('/api/conversations/:id', async (c) => {
    const actor = sessions.require(c);
    const query = z
      .object({
        before: z.coerce.number().int().nonnegative().optional(),
        includeResults: z.enum(['true', 'false']).default('false'),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(c.req.query());
    return c.json(
      await repository.conversation(
        actor,
        c.req.param('id'),
        query.before,
        query.limit,
        query.includeResults === 'true',
      ),
    );
  });
  app.get('/api/runs/:id', async (c) => {
    const actor = sessions.require(c);
    return c.json(await runDto(actor, await repository.run(actor, c.req.param('id'))));
  });
  app.post('/api/runs/:id/cancel', async (c) => {
    const actor = sessions.require(c);
    const row = await repository.run(actor, c.req.param('id'));
    if (row.status === 'running') {
      await repository.finish(actor, row.id, 'cancelled', 'CANCELLED');
      active.get(row.id)?.controller.abort();
    }
    return c.json(await runDto(actor, await repository.run(actor, row.id)));
  });
  app.get('/api/results/:id', async (c) => {
    const result = await repository.result(sessions.require(c), c.req.param('id'));
    return c.json({ ...result, panels: result.panels.map(withLocationRecipe) });
  });
  app.get('/api/evidence/:id', async (c) => {
    const actor = sessions.require(c);
    const resultId = z.string().min(1).max(128).parse(c.req.query('resultId'));
    const result = await repository.result(actor, resultId);
    const evidence = result.evidence.find((item) => item.id === c.req.param('id'));
    if (!evidence)
      throw new ApplicationError(404, 'NOT_FOUND', 'Evidence not found in this result.');
    return c.json(evidence);
  });
  app.get('/api/references', async (c) => {
    const actor = sessions.require(c);
    const query = listQuery.parse(c.req.query());
    return c.json(await repository.listReferences(actor, query.after, query.limit));
  });
  app.post('/api/read-runs', async (c) =>
    c.json(
      await readRun(sessions.require(c), readBody.parse(await c.req.json()), c.req.raw.signal),
    ),
  );
  app.post('/api/results/:id/refresh', async (c) => {
    const actor = sessions.require(c);
    const result = await repository.result(actor, c.req.param('id'));
    const input = refreshBody.parse(await c.req.json());
    const bound = result.panels
      .map(withLocationRecipe)
      .flatMap((panel) =>
        panel.recipe ? [{ id: panel.id, title: panel.title, recipe: panel.recipe }] : [],
      );
    return c.json(
      await readRun(
        actor,
        { requestId: input.requestId, panels: overrides(bound, input) },
        c.req.raw.signal,
      ),
    );
  });
  app.get('/api/saved-views', async (c) => {
    const actor = sessions.require(c);
    const query = listQuery.parse(c.req.query());
    return c.json(await repository.listViews(actor, query.after, query.limit));
  });
  app.post('/api/saved-views', async (c) => {
    const actor = sessions.require(c);
    const body = z
      .union([
        z.object({ definition: savedViewDefinitionSchema }).strict(),
        z
          .object({
            sourceResultId: z.string().min(1),
            name: z.string().min(1).max(200),
            description: z.string().max(1000).default(''),
            panelIds: z.array(z.string()).min(1).max(8).optional(),
          })
          .strict(),
      ])
      .parse(await c.req.json());
    let definition: SavedViewDefinition;
    if ('definition' in body) definition = body.definition;
    else {
      const result = await repository.result(actor, body.sourceResultId);
      const panels = result.panels
        .map(withLocationRecipe)
        .filter((panel) => !body.panelIds || body.panelIds.includes(panel.id));
      if (
        !panels.length ||
        panels.some((panel) => !panel.recipe) ||
        body.panelIds?.some((id) => !panels.some((panel) => panel.id === id))
      )
        throw new ApplicationError(
          422,
          'UNSUPPORTED_VIEW',
          'Only panels with approved read bindings can be saved.',
        );
      definition = savedViewDefinitionSchema.parse({
        name: body.name,
        description: body.description,
        panels: panels.map((panel) => ({ id: panel.id, title: panel.title, recipe: panel.recipe })),
      });
    }
    return c.json(await repository.createView(actor, definition), 201);
  });
  app.get('/api/saved-views/:id', async (c) =>
    c.json(await repository.view(sessions.require(c), c.req.param('id'))),
  );
  app.patch('/api/saved-views/:id', async (c) => {
    const actor = sessions.require(c);
    const body = z
      .object({
        expectedRevision: z.number().int().positive(),
        definition: savedViewDefinitionSchema,
      })
      .strict()
      .parse(await c.req.json());
    return c.json(
      await repository.updateView(actor, c.req.param('id'), body.expectedRevision, body.definition),
    );
  });
  app.post('/api/saved-views/:id/runs', async (c) => {
    const actor = sessions.require(c);
    const view = await repository.view(actor, c.req.param('id'));
    const definition = savedViewDefinitionSchema.parse(view.definition);
    const input = refreshBody.parse(await c.req.json());
    return c.json(
      await readRun(
        actor,
        {
          requestId: input.requestId,
          panels: overrides(definition.panels, input),
          viewId: view.id,
          viewRevision: view.revision,
          kind: 'saved-view',
        },
        c.req.raw.signal,
      ),
    );
  });
  app.post('/api/results/compose', async (c) => {
    const actor = sessions.require(c);
    const body = z
      .object({
        requestId,
        conversationId: z.string().min(1).max(256),
        components: z
          .array(
            z
              .object({ resultId: z.string().min(1).max(256), panelId: z.string().min(1).max(256) })
              .strict(),
          )
          .min(1)
          .max(8),
      })
      .strict()
      .parse(await c.req.json());
    const admission = await repository.admit(actor, {
      requestId: body.requestId,
      kind: 'chat',
      conversationId: body.conversationId,
      payload: { operation: 'compose-view', components: body.components },
      userText: 'Combine selected components into one view.',
      asOf: clock(),
    });
    if (admission.replay) {
      const previous = await repository.forRun(actor, admission.run.id);
      if (previous) return c.json({ run: await runDto(actor, admission.run), result: previous });
      throw new ApplicationError(
        409,
        'RUN_ALREADY_EXISTS',
        'This composition request already exists.',
      );
    }
    try {
      c.req.raw.signal.throwIfAborted();
      const selected = await resolveViewComponents(
        repository,
        actor,
        body.conversationId,
        body.components,
      );
      const output = combineViewComponents(selected);
      const accepted = resultPayload(
        admission.run,
        {
          ...output,
          answerSupport: {
            mode: 'deterministic-facts',
            explanationStatus: 'available',
            warnings: [],
          },
        },
        'Combined the selected components into one view. Earlier components retain their original data and filters; refresh the saved view to read the records again.',
      );
      c.req.raw.signal.throwIfAborted();
      if (
        !(await repository.complete(actor, admission.run.id, accepted, admission.assistantSequence))
      )
        throw new ApplicationError(409, 'RUN_CANCELLED', 'Composition is no longer active.');
      return c.json({
        run: await runDto(actor, await repository.run(actor, admission.run.id)),
        result: accepted,
      });
    } catch (error) {
      await repository.finish(
        actor,
        admission.run.id,
        c.req.raw.signal.aborted ? 'cancelled' : 'failed',
        c.req.raw.signal.aborted ? 'CANCELLED' : asError(error).code,
      );
      throw error;
    }
  });
  app.post('/api/chat', async (c) => {
    const actor = sessions.require(c);
    const body = applicationChatRequestSchema.parse(await c.req.json());
    const admission = await repository.admit(actor, {
      requestId: body.requestId,
      kind: 'chat',
      payload: { text: body.message.text },
      asOf: clock(),
      conversationId: body.conversationId,
      userText: body.message.text,
    });
    const previous = admission.replay ? await repository.forRun(actor, admission.run.id) : null;
    if (admission.replay && !previous)
      throw new ApplicationError(
        409,
        'RUN_ALREADY_EXISTS',
        `Request already has a ${admission.run.status} run (${admission.run.id}).`,
      );
    if (
      !admission.replay &&
      [...active.values()].filter((item) => item.kind === 'chat').length >= (config.maxActive ?? 4)
    ) {
      await repository.finish(actor, admission.run.id, 'failed', 'CAPACITY');
      throw new ApplicationError(429, 'CAPACITY', 'Application capacity reached.');
    }
    const controller = new AbortController();
    let disconnected = false;
    const signal = AbortSignal.any([controller.signal, c.req.raw.signal]);
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 120000);
    if (!previous)
      active.set(admission.run.id, { controller, ownerId: actor.ownerId, kind: 'chat' });
    const stream = createUIMessageStream<ApplicationMessage>({
      generateId: () => `assistant-${admission.run.id}`,
      execute: async ({ writer }) => {
        writer.write({
          type: 'start',
          messageId: `assistant-${admission.run.id}`,
          messageMetadata: { runId: admission.run.id },
        });
        try {
          let accepted = previous;
          if (!accepted) {
            const history = await repository.history(actor, body.conversationId, admission.run.id);
            const output = await config.agent(
              {
                runId: admission.run.id,
                conversationId: body.conversationId,
                messages: history,
                context: context(actor, signal, admission.run.asOf.toISOString()),
              },
              (progress) => {
                if (!signal.aborted && !disconnected)
                  writer.write({
                    type: 'data-progress',
                    transient: true,
                    data: { runId: admission.run.id, ...progress },
                  });
              },
            );
            signal.throwIfAborted();
            accepted = resultPayload(admission.run, output, output.text, output.agentExecutionId);
            if (
              !(await repository.complete(
                actor,
                admission.run.id,
                accepted,
                admission.assistantSequence,
              ))
            )
              throw new ApplicationError(409, 'RUN_CANCELLED', 'Run is no longer active.');
          }
          if (disconnected) return;
          writer.write({
            type: 'message-metadata',
            messageMetadata: { runId: admission.run.id, resultId: accepted.id },
          });
          writer.write({ type: 'text-start', id: admission.run.id });
          writer.write({ type: 'text-delta', id: admission.run.id, delta: accepted.text });
          writer.write({ type: 'text-end', id: admission.run.id });
          writer.write({
            type: 'data-citations',
            id: `${accepted.id}:citations`,
            data: { runId: admission.run.id, resultId: accepted.id, evidence: accepted.evidence },
          });
          writer.write({
            type: 'data-visual',
            id: accepted.id,
            data: { kind: 'application-result', schemaVersion: 1, result: accepted },
          });
          writer.write({ type: 'finish', finishReason: 'stop' });
        } catch (error) {
          if (!previous)
            await repository.finish(
              actor,
              admission.run.id,
              signal.aborted ? 'cancelled' : 'failed',
              signal.aborted ? 'CANCELLED' : 'AGENT_FAILED',
            );
          if (!disconnected) {
            writer.write({
              type: 'error',
              errorText: signal.aborted ? 'Run cancelled or timed out.' : asError(error).message,
            });
            writer.write({ type: 'finish', finishReason: 'error' });
          }
        } finally {
          clearTimeout(timer);
          active.delete(admission.run.id);
        }
      },
      onError: () => 'Application stream failed.',
    });
    const reader = stream.getReader();
    const cancellable = new ReadableStream({
      async pull(output) {
        const item = await reader.read();
        if (item.done) output.close();
        else output.enqueue(item.value);
      },
      async cancel() {
        disconnected = true;
        controller.abort();
        if (!previous)
          await repository.finish(actor, admission.run.id, 'cancelled', 'DISCONNECTED');
        await reader.cancel();
      },
    });
    return createUIMessageStreamResponse({
      stream: cancellable,
      headers: {
        'Cache-Control': 'no-store',
        'X-Run-ID': admission.run.id,
        'X-Request-ID': body.requestId,
      },
    });
  });
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }, 404));
  app.onError((error, c) => {
    if (error instanceof HTTPException)
      return c.json({ error: { code: 'HTTP_ERROR', message: error.message } }, error.status);
    const failure = asError(error);
    return c.json(
      {
        error: {
          code: failure.code,
          message: failure.message,
          requestId: c.res.headers.get('X-Request-ID'),
        },
      },
      failure.status,
    );
  });
  return {
    app,
    repository,
    async shutdown() {
      for (const [id, item] of active) {
        item.controller.abort();
        await repository.finish(
          { namespace: config.namespace, ownerId: item.ownerId },
          id,
          'cancelled',
          'SERVER_SHUTDOWN',
        );
      }
      active.clear();
    },
  };
}
