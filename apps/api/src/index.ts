import 'dotenv/config';
import { serve } from '@hono/node-server';
import { z } from 'zod';
import { app } from './app.js';

const env = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    HOST: z.string().min(1).default('127.0.0.1'),
  })
  .parse(process.env);

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
  console.log(`API ready at http://${env.HOST}:${info.port} (synthetic fixture mode)`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
