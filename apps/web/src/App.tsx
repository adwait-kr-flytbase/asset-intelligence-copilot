// biome-ignore-all lint/suspicious/noArrayIndexKey: SDK message parts append in order and text parts have no stable ID.
import { useChat } from '@ai-sdk/react';
import { type CopilotMessage, visualSchema } from '@repo/contracts';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';
import { chatTransport, getHealth, isFixtureMode } from './api';
import './App.css';

function Foundation() {
  const [input, setInput] = useState('Check the chat connection');
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, retry: false });
  const { messages, sendMessage, status, error, stop } = useChat<CopilotMessage>({
    transport: chatTransport,
    dataPartSchemas: { visual: visualSchema },
  });
  const busy = status === 'submitted' || status === 'streaming';
  return (
    <main>
      <header>
        <p className="eyebrow">Asset Intelligence Copilot</p>
        <h1>Workspace foundation</h1>
        <p>
          {isFixtureMode ? 'Frontend fixtures · no backend required' : 'Connected to the Hono API'}
        </p>
        <p role="status">
          {health.isError ? health.error.message : health.isPending ? 'Connecting…' : 'Ready'}
        </p>
      </header>
      <p className="notice">
        Infrastructure demo: all responses are synthetic. The real agent, dataset, and persistent
        memory will be built on the backend branch.
      </p>
      <section aria-label="Conversation" aria-live="polite">
        {messages.map((message) => (
          <article key={message.id}>
            <h2>{message.role === 'user' ? 'You' : 'Copilot'}</h2>
            {message.parts.map((part, index) => {
              if (part.type === 'text') return <p key={`${message.id}-${index}`}>{part.text}</p>;
              if (part.type !== 'data-visual') return null;
              const visual = part.data;
              return (
                <figure key={`${message.id}-${index}`}>
                  <figcaption>{visual.assetId} · Synthetic status card</figcaption>
                  <dl>
                    <dt>Producing</dt>
                    <dd>{visual.producing ? 'Yes' : 'No'}</dd>
                    <dt>Temperature above ambient</dt>
                    <dd>{visual.temperatureDeltaC} °C</dd>
                    <dt>Observed</dt>
                    <dd>{visual.observedAt}</dd>
                  </dl>
                  <details>
                    <summary>Evidence</summary>
                    {visual.sources.map((source) => (
                      <p key={source.id}>
                        {source.label} · <code>{source.id}</code>
                      </p>
                    ))}
                  </details>
                </figure>
              );
            })}
          </article>
        ))}
      </section>
      {error && <p role="alert">Unable to send: {error.message}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim() || busy) return;
          void sendMessage({ text: input.trim() });
          setInput('');
        }}
      >
        <label htmlFor="message">Message</label>
        <div className="composer">
          <input id="message" value={input} onChange={(event) => setInput(event.target.value)} />
          <button type="submit" disabled={busy || !input.trim()}>
            Send
          </button>
          {busy && (
            <button type="button" onClick={() => void stop()}>
              Stop
            </button>
          )}
        </div>
      </form>
    </main>
  );
}

const queryClient = new QueryClient();
const rootRoute = createRootRoute({ component: Foundation });
const router = createRouter({ routeTree: rootRoute });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
