import { z } from 'zod';
import { restoreSnapshot, type Snapshot, validateSnapshot } from './protocol';

export const HISTORY_KEY = 'genui-lab-history-v2';
export const LEGACY_KEY = 'genui-lab-investigation-v1';
const entrySchema = z
  .object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    text: z.string(),
    status: z.enum(['pending', 'complete', 'failed', 'cancelled']),
    runId: z.string(),
    resultId: z.string().optional(),
    contextResultId: z.string().optional(),
    sourceIds: z.array(z.string()).optional(),
    createdAt: z.string(),
  })
  .strict();
export type Entry = z.infer<typeof entrySchema>;
export type Thread = {
  id: string;
  title: string;
  updatedAt: string;
  entries: Entry[];
  results: Record<string, Snapshot>;
  activeResultId: string | null;
  area: string;
  selected: string;
};
export type History = { schemaVersion: 2; activeId: string; threads: Thread[] };
const threadSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    updatedAt: z.string(),
    entries: z.array(entrySchema),
    results: z.record(z.unknown()),
    activeResultId: z.string().nullable(),
    area: z.enum(['All areas', 'North ridge', 'South basin']),
    selected: z.string().regex(/^LAB-W0[1-6]$/),
  })
  .strict();
const historySchema = z
  .object({
    schemaVersion: z.literal(2),
    activeId: z.string(),
    threads: z.array(threadSchema).min(1),
  })
  .strict();
export function newThread(): Thread {
  return {
    id: crypto.randomUUID(),
    title: 'New investigation',
    updatedAt: new Date().toISOString(),
    entries: [],
    results: {},
    activeResultId: null,
    area: 'All areas',
    selected: 'LAB-W01',
  };
}
export function emptyHistory(): History {
  const thread = newThread();
  return { schemaVersion: 2, activeId: thread.id, threads: [thread] };
}
export function readHistory(raw: string): History {
  const parsed = historySchema.parse(JSON.parse(raw));
  if (
    new Set(parsed.threads.map((t) => t.id)).size !== parsed.threads.length ||
    !parsed.threads.some((t) => t.id === parsed.activeId)
  )
    throw Error('Invalid thread identity');
  const threads = parsed.threads.map((t) => {
    const results: Record<string, Snapshot> = {};
    for (const [id, value] of Object.entries(t.results)) {
      const snapshot = validateSnapshot(value);
      if (snapshot.phase !== 'ready' || snapshot.runId !== id)
        throw Error('Incomplete saved result');
      results[id] = snapshot;
    }
    if (t.activeResultId && !Object.hasOwn(results, t.activeResultId))
      throw Error('Missing active result');
    if (new Set(t.entries.map((e) => e.id)).size !== t.entries.length)
      throw Error('Duplicate entry');
    const entries = t.entries.map((e) => {
      if (e.contextResultId) {
        if (
          !Object.hasOwn(results, e.contextResultId) ||
          e.role !== 'assistant' ||
          e.status !== 'complete'
        )
          throw Error('Invalid explanation context');
        const sources = new Set(results[e.contextResultId].result.sources.map((s) => s.id));
        if (e.sourceIds?.some((id) => !sources.has(id))) throw Error('Invalid explanation source');
      } else if (e.sourceIds?.length) throw Error('Missing explanation context');
      if (
        e.resultId &&
        (!Object.hasOwn(results, e.resultId) ||
          e.runId !== e.resultId ||
          e.role !== 'assistant' ||
          e.status !== 'complete')
      )
        throw Error('Invalid answer link');
      return e.status === 'pending'
        ? {
            ...e,
            status: 'cancelled' as const,
            text: 'Update interrupted by reload. Ask again to continue.',
          }
        : e;
    });
    return { ...t, entries, results };
  });
  return { ...parsed, threads };
}
export function migrateLegacy(raw: string): History {
  const snapshot = restoreSnapshot(raw);
  const history = emptyHistory(),
    thread = history.threads[0];
  thread.title = snapshot.result.title;
  thread.results[snapshot.runId] = snapshot;
  thread.activeResultId = snapshot.runId;
  thread.entries.push({
    id: crypto.randomUUID(),
    role: 'assistant',
    text: 'Recovered your previously saved investigation.',
    status: 'complete',
    runId: snapshot.runId,
    resultId: snapshot.runId,
    createdAt: new Date().toISOString(),
  });
  return history;
}
export function latestResult(thread: Thread): Snapshot | null {
  const entry = [...thread.entries].reverse().find((e) => e.resultId);
  return entry?.resultId ? thread.results[entry.resultId] : null;
}
export function completeAnswer(
  thread: Thread,
  snapshot: Snapshot,
  text: string,
  activate = true,
): Thread {
  if (snapshot.phase !== 'ready') throw Error('Cannot save partial result');
  const pending = thread.entries.find(
    (e) => e.role === 'assistant' && e.runId === snapshot.runId && e.status === 'pending',
  );
  if (!pending) return thread; // Cancelled and cross-thread events cannot create answers.
  return {
    ...thread,
    updatedAt: new Date().toISOString(),
    activeResultId: activate ? snapshot.runId : thread.activeResultId,
    results: { ...thread.results, [snapshot.runId]: snapshot },
    entries: thread.entries.map((e) =>
      e.id === pending.id ? { ...e, text, status: 'complete', resultId: snapshot.runId } : e,
    ),
  };
}

export function completeTextAnswer(
  thread: Thread,
  snapshot: Snapshot,
  text: string,
  sourceIds: string[],
): Thread {
  if (snapshot.phase !== 'ready') throw Error('Incomplete answer basis');
  const sources = new Set(snapshot.result.sources.map((s) => s.id));
  if (sourceIds.some((id) => !sources.has(id))) throw Error('Unknown answer source');
  if (
    !thread.entries.some(
      (e) => e.runId === snapshot.runId && e.role === 'assistant' && e.status === 'pending',
    )
  )
    return thread;
  return {
    ...thread,
    updatedAt: new Date().toISOString(),
    results: { ...thread.results, [snapshot.runId]: snapshot },
    entries: thread.entries.map((e) =>
      e.runId === snapshot.runId && e.role === 'assistant' && e.status === 'pending'
        ? { ...e, text, status: 'complete', contextResultId: snapshot.runId, sourceIds }
        : e,
    ),
  };
}
