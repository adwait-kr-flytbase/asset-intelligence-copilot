import { serve } from '@hono/node-server';
import { createApp } from './app';

serve({ fetch: createApp().fetch, hostname: '127.0.0.1', port: 3401 }, (info) => {
  console.log(`Fieldwork synthetic fixture API: http://127.0.0.1:${info.port}`);
});
