import 'dotenv/config';
import { serve } from '@hono/node-server';
import { z } from 'zod';
import { createOpenRouterModel } from '../agents/openrouter.js';
import { createAnalyticsService } from '../evidence/analytics.js';
import { createPostgresAnalytics } from '../evidence/analytics-postgres.js';
import { createPostgresEvidence } from '../evidence/postgres.js';
import { createEvidenceService } from '../evidence/service.js';
import { closeDatabase, getDatabase } from '../storage/database.js';
import { createAgentApp } from './app.js';

const env = z
  .object({
    AGENT_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
    AGENT_NAMESPACE: z.string().trim().min(1),
    AGENT_AS_OF: z.iso.datetime().optional(),
    AGENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(120000),
  })
  .parse(process.env);
const asOf = env.AGENT_AS_OF ?? new Date().toISOString();
const evidence = createEvidenceService(
  createPostgresEvidence(getDatabase().pool, env.AGENT_NAMESPACE),
  asOf,
);
const app = createAgentApp({
  evidence,
  timeoutMs: env.AGENT_TIMEOUT_MS,
  analytics: createAnalyticsService(
    createPostgresAnalytics(getDatabase().pool, env.AGENT_NAMESPACE, asOf),
    asOf,
  ),
  specialistModels: () => ({
    evidence: createOpenRouterModel({
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      modelId:
        process.env.OPENROUTER_EVIDENCE_MODEL ?? process.env.OPENROUTER_MODEL ?? 'openai/gpt-4.1',
    }),
    procedures: createOpenRouterModel({
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      modelId:
        process.env.OPENROUTER_PROCEDURE_MODEL ?? process.env.OPENROUTER_MODEL ?? 'openai/gpt-4.1',
    }),
  }),
  model: () =>
    createOpenRouterModel({
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      modelId: process.env.OPENROUTER_MODEL ?? 'openai/gpt-4.1',
    }),
});
const server = serve({ fetch: app.fetch, port: env.AGENT_PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(
    `Read-only evidence runtime at http://127.0.0.1:${info.port}; no conversation persistence`,
  );
});
function shutdown() {
  server.close(() => {
    void closeDatabase().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
