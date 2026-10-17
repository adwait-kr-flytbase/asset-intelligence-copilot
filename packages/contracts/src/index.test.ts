import { describe, expect, it } from 'vitest';
import { chatRequestSchema, visualSchema } from './index.js';

describe('wire contracts', () => {
  it('requires explicit user and conversation scope for chat', () => {
    expect(chatRequestSchema.safeParse({ messages: [] }).success).toBe(false);
    expect(
      chatRequestSchema.safeParse({ userId: 'U-fixture', conversationId: 'c-1', messages: [] })
        .success,
    ).toBe(false);
  });

  it('rejects visual values without evidence or finite measurements', () => {
    const visual = {
      kind: 'well-status',
      assetId: 'WELL-FIXTURE',
      producing: false,
      temperatureDeltaC: 3.2,
      observedAt: '2026-10-15T15:30:00Z',
      sources: [],
    };
    expect(visualSchema.safeParse(visual).success).toBe(false);
    expect(
      visualSchema.safeParse({
        ...visual,
        temperatureDeltaC: Number.NaN,
        sources: [{ id: 'fixture', label: 'Synthetic inspection', path: 'fixture://inspection' }],
      }).success,
    ).toBe(false);
  });
});
