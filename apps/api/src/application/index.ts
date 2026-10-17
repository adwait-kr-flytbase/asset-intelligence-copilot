import 'dotenv/config';
import { serve } from '@hono/node-server';
import { z } from 'zod';
import { agentModelIdsFromEnv, createAgentModels } from '../agents/models.js';
import { closeDatabase, getDatabase } from '../storage/database.js';
import { createApplicationAgent } from './agent-adapter.js';
import { createApplicationApp } from './app.js';
import { createApplicationData } from './data.js';

const env = z
  .object({
    APP_PORT: z.coerce.number().int().min(1).max(65535).default(3003),
    APP_NAMESPACE: z.string().trim().min(1),
    APP_SESSION_SECRET: z.string().min(32),
    APP_AS_OF: z.iso.datetime().optional(),
    APP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(120000),
    APP_ALLOWED_ORIGINS: z.string().optional(),
  })
  .parse(process.env);
const connection = getDatabase();
const processLock = await connection.pool.connect();
const lockKey = `application-runtime:${env.APP_NAMESPACE}`;
const lock = await processLock.query(
  'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',
  [lockKey],
);
if (!lock.rows[0]?.locked) {
  processLock.release();
  await closeDatabase();
  throw new Error('Another application process owns this namespace.');
}
const data = createApplicationData(connection);
const models = () =>
  createAgentModels(process.env.OPENROUTER_API_KEY ?? '', agentModelIdsFromEnv(process.env));
const runtime = createApplicationApp({
  connection,
  data,
  agent: createApplicationAgent(connection, data, {
    model: () => models().model,
    specialistModels: () => models().specialistModels,
  }),
  namespace: env.APP_NAMESPACE,
  sessionSecret: env.APP_SESSION_SECRET,
  asOf: env.APP_AS_OF,
  timeoutMs: env.APP_TIMEOUT_MS,
  allowedOrigins: env.APP_ALLOWED_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean),
});
await runtime.repository.interruptRunning(env.APP_NAMESPACE);
const server = serve({ fetch: runtime.app.fetch, port: env.APP_PORT, hostname: '127.0.0.1' }, () =>
  console.log(
    `Application API at http://127.0.0.1:${env.APP_PORT}; demo persona identity, PostgreSQL persistence`,
  ),
);
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  void runtime.shutdown().finally(() => {
    server.close(() => {
      processLock.release();
      void closeDatabase().finally(() => process.exit(0));
    });
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
