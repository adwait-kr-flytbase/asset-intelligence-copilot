import type { LanguageModel } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

type Model = Extract<LanguageModel, { specificationVersion: 'v3' }>;
type Content = Awaited<ReturnType<Model['doGenerate']>>['content'];

export function scriptedModel(steps: Content[]) {
  return new MockLanguageModelV3({
    doGenerate: steps.map((content) => ({
      content,
      finishReason: {
        unified: content.some((part) => part.type === 'tool-call') ? 'tool-calls' : 'stop',
        raw: undefined,
      },
      warnings: [],
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 10, text: 10, reasoning: undefined },
      },
    })),
  });
}
export const call = (name: string, input: unknown, id = 'call-1'): Content => [
  { type: 'tool-call', toolCallId: id, toolName: name, input: JSON.stringify(input) },
];
export const answer = (text: string): Content => [{ type: 'text', text }];
