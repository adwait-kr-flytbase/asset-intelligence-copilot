import { type CopilotMessage, healthSchema } from '@repo/contracts';
import { fixtureText, fixtureVisual } from '@repo/contracts/fixtures';
import { createUIMessageStream, createUIMessageStreamResponse, DefaultChatTransport } from 'ai';

const mode = import.meta.env.VITE_API_MODE || 'fixture';
if (mode !== 'fixture' && mode !== 'live')
  throw new Error('VITE_API_MODE must be fixture or live.');
export const isFixtureMode = mode === 'fixture';

// Frontend development needs no backend process or credentials.
const fixtureFetch: typeof fetch = async () => {
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
  return createUIMessageStreamResponse({ stream });
};

export const chatTransport = new DefaultChatTransport<CopilotMessage>({
  api: '/api/chat',
  ...(isFixtureMode ? { fetch: fixtureFetch } : {}),
  body: { userId: 'U-fixture', conversationId: 'foundation-demo' },
});

export async function getHealth() {
  if (isFixtureMode) return healthSchema.parse({ status: 'ok', mode: 'fixture' });
  const response = await fetch('/api/health');
  if (!response.ok) throw new Error('API unavailable. Check its process and VITE_API_TARGET.');
  return healthSchema.parse(await response.json());
}
