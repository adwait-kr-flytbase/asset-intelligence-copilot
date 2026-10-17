import { config } from 'dotenv';

config({ quiet: true });

import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { providerFromEnv } from './provider.ts';

const port = Number(process.env.LAB_API_PORT || 3201);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid LAB_API_PORT');
const app = createApp(providerFromEnv());
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () =>
  console.log(`Generative UI lab backend: http://127.0.0.1:${port} (synthetic data only)`),
);
server.on('error', () => {
  console.error('Cannot start demo backend. Check LAB_API_PORT is free.');
  process.exit(1);
});
for (const event of ['SIGINT', 'SIGTERM'] as const)
  process.on(event, () => server.close(() => process.exit(0)));
