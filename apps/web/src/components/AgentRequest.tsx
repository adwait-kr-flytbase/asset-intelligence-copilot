import { useChat } from '@ai-sdk/react';
import {
  type ApplicationMessage,
  type ApplicationResult,
  applicationResultSchema,
} from '@repo/contracts';
import { DefaultChatTransport } from 'ai';
import { useEffect, useMemo, useRef } from 'react';
import { applicationFetch, chatRequestBody } from '../api';
import type { ChatRequest } from '../types';
export function AgentRequest({
  request,
  onResult,
  onError,
  onProgress,
  onRun,
}: {
  request: ChatRequest;
  onResult: (id: string, result: ApplicationResult) => void;
  onError: (id: string, message: string) => void;
  onProgress: (id: string, label: string) => void;
  onRun: (id: string, runId: string) => void;
}) {
  const callbacks = useRef({ onResult, onError, onProgress, onRun });
  callbacks.current = { onResult, onError, onProgress, onRun };
  const received = useRef(false);
  const reportedRun = useRef<string | null>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ApplicationMessage>({
        api: '/api/chat',
        fetch: async (input, init) => {
          const response = await applicationFetch(input, init);
          const id = response.headers.get('X-Run-ID');
          if (id && response.ok) {
            reportedRun.current = id;
            callbacks.current.onRun(request.id, id);
          }
          return response;
        },
        prepareSendMessagesRequest: () => ({
          body: chatRequestBody({
            id: request.id,
            conversationId: request.conversationId,
            question: request.question,
          }),
        }),
      }),
    [request.id, request.conversationId, request.question],
  );
  const { sendMessage, stop } = useChat<ApplicationMessage>({
    transport,
    onData(part) {
      if (part.type === 'data-progress') {
        if (reportedRun.current === part.data.runId)
          callbacks.current.onProgress(request.id, part.data.label);
      }
      if (part.type === 'data-visual') {
        try {
          const result = applicationResultSchema.parse(part.data.result);
          if (
            part.data.kind !== 'application-result' ||
            result.conversationId !== request.conversationId ||
            result.runId !== reportedRun.current
          )
            throw new Error('Result identity mismatch');
          received.current = true;
          callbacks.current.onResult(request.id, result);
        } catch {
          callbacks.current.onError(
            request.id,
            'The returned result could not be verified. Earlier results are unchanged.',
          );
        }
      }
    },
    onError(error) {
      callbacks.current.onError(request.id, error.message || 'The investigation could not finish.');
    },
    onFinish({ isAbort }) {
      if (!received.current && !isAbort)
        callbacks.current.onError(
          request.id,
          'No accepted result was returned. Earlier results are unchanged.',
        );
    },
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      void sendMessage({ text: request.question }).catch(() =>
        callbacks.current.onError(request.id, 'The investigation could not finish.'),
      );
    }, 0);
    return () => {
      clearTimeout(timer);
      void stop();
    };
  }, [request.id, request.question, sendMessage, stop]);
  return null;
}
