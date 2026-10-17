import 'dotenv/config';
import { serve } from '@hono/node-server';
import { z } from 'zod';
import { createOpenRouterModel } from '../agents/openrouter.js';
import { createPostgresEvidence } from '../evidence/postgres.js';
import { createEvidenceService } from '../evidence/service.js';
import { closeDatabase, getDatabase } from '../storage/database.js';
import { createAgentApp } from './app.js';

const env = z
  .object({
    AGENT_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
    AGENT_NAMESPACE: z.string().trim().min(1),
    AGENT_AS_OF: z.iso.datetime().optional(),
  })
  .parse(process.env);
const evidence = createEvidenceService(
  createPostgresEvidence(getDatabase().pool, env.AGENT_NAMESPACE),
  env.AGENT_AS_OF ?? new Date().toISOString(),
);
const app = createAgentApp({
  evidence,
  model: () =>
    createOpenRouterModel({
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      modelId: process.env.OPENROUTER_MODEL ?? '',
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
