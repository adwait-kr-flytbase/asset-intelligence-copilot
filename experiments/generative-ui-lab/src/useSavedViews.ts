import { useRef, useState } from 'react';
import { z } from 'zod';
import { type Snapshot, validateSnapshot } from './protocol';
import { type SavedView, savedViewSchema } from './view-contract';

export const VIEW_STORAGE_KEY = 'fieldwork-saved-views-v1';
type Store = { version: 1; definitions: SavedView[]; lastRuns: Record<string, Snapshot> };
const schema = z
  .object({
    version: z.literal(1),
    definitions: z.array(savedViewSchema),
    lastRuns: z.record(z.unknown()),
  })
  .strict();
export function readViews(raw: string): Store {
  const input = schema.parse(JSON.parse(raw));
  if (
    new Set(input.definitions.map((v) => v.id)).size !== input.definitions.length ||
    new Set(input.definitions.map((v) => v.name.toLowerCase())).size !== input.definitions.length
  )
    throw Error('Duplicate saved view');
  const lastRuns: Record<string, Snapshot> = {};
  for (const [id, value] of Object.entries(input.lastRuns)) {
    const definition = input.definitions.find((v) => v.id === id),
      snapshot = validateSnapshot(value);
    if (
      !definition ||
      snapshot.phase !== 'ready' ||
      snapshot.execution?.kind !== 'saved-view' ||
      snapshot.execution.savedView?.id !== id ||
      snapshot.execution.savedView.revision !== definition.revision ||
      JSON.stringify(snapshot.plan) !== JSON.stringify(definition.plan)
    )
      throw Error('Invalid saved-view run');
    lastRuns[id] = snapshot;
  }
  return { ...input, lastRuns };
}
function load() {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    return {
      store: raw ? readViews(raw) : { version: 1 as const, definitions: [], lastRuns: {} },
      error: '',
    };
  } catch {
    return {
      store: { version: 1 as const, definitions: [], lastRuns: {} },
      error:
        'Saved views could not be read. The original storage is retained; recover it in Demo settings before saving new views.',
    };
  }
}
export function useSavedViews() {
  const [initial] = useState(load),
    [store, setStore] = useState<Store>(initial.store),
    [error, setError] = useState(initial.error);
  const ref = useRef(store),
    blocked = useRef(!!initial.error);
  function persist(next: Store, requireSave = false) {
    if (blocked.current) throw Error(initial.error || 'Saved-view storage needs recovery.');
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(next));
      setError('');
    } catch {
      setError(
        'Saved-view storage is unavailable or full. Last completed results remain available for this session.',
      );
      if (requireSave)
        throw Error('Could not save this view on this device. Free browser storage and try again.');
    }
    ref.current = next;
    setStore(next);
  }
  return {
    ...store,
    error,
    save(definition: SavedView) {
      const validated = savedViewSchema.parse(definition);
      if (
        ref.current.definitions.some((v) => v.name.toLowerCase() === validated.name.toLowerCase())
      )
        throw Error('A saved view already has this name. Choose a different name.');
      persist({ ...ref.current, definitions: [...ref.current.definitions, validated] }, true);
    },
    recordRun(definition: SavedView, snapshot: Snapshot) {
      if (!ref.current.definitions.some((v) => v.id === definition.id))
        throw Error('Saved definition is no longer available.');
      persist({ ...ref.current, lastRuns: { ...ref.current.lastRuns, [definition.id]: snapshot } });
    },
    recover() {
      try {
        const raw = localStorage.getItem(VIEW_STORAGE_KEY);
        if (raw) localStorage.setItem(`${VIEW_STORAGE_KEY}-recovery-${Date.now()}`, raw);
        localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(ref.current));
        blocked.current = false;
        setError('');
      } catch {
        setError('Storage recovery could not finish. Your original saved data is retained.');
      }
    },
  };
}
