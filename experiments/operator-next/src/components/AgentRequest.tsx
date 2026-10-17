import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef } from 'react';
import type { AgentMessage, AgentResponse } from '../contracts';
import { checkedResponse, type Request } from '../types';
const transport = new DefaultChatTransport<AgentMessage>({
  api: '/api/chat',
  prepareSendMessagesRequest: ({ messages, body }) => ({
    body: {
      ...body,
      messages: messages
        .slice(-1)
        .map((m) => ({ ...m, parts: m.parts.filter((p) => p.type === 'text') })),
    },
  }),
});
export function AgentRequest({
  request,
  onResult,
  onError,
  onProgress,
}: {
  request: Request;
  onResult: (id: string, result: AgentResponse) => void;
  onError: (id: string, message: string) => void;
  onProgress: (id: string, label: string) => void;
}) {
  const callbacks = useRef({ onResult, onError, onProgress });
  callbacks.current = { onResult, onError, onProgress };
  const received = useRef(false);
  const { sendMessage, stop } = useChat<AgentMessage>({
    transport,
    onData(part) {
      if (part.type === 'data-result') {
        try {
          const response = checkedResponse(part.data, request.id);
          received.current = true;
          callbacks.current.onResult(request.id, response);
        } catch {
          callbacks.current.onError(
            request.id,
            'The returned data could not be verified. Your previous results are unchanged.',
          );
        }
      }
      if (part.type === 'data-progress' && part.data.requestId === request.id)
        callbacks.current.onProgress(request.id, part.data.label);
    },
    onError() {
      callbacks.current.onError(
        request.id,
        'The investigation could not finish. Check the demo service and try again.',
      );
    },
    onFinish() {
      if (!received.current)
        callbacks.current.onError(
          request.id,
          'No verified result was returned. Try this question again.',
        );
    },
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      void sendMessage(
        { text: request.question },
        { body: { requestId: request.id, parameters: request.parameters } },
      ).catch(() =>
        callbacks.current.onError(request.id, 'The investigation could not finish. Try again.'),
      );
    }, 0);
    return () => {
      clearTimeout(timer);
      void stop();
    };
  }, [request.id, request.question, request.parameters, sendMessage, stop]);
  return null;
}
