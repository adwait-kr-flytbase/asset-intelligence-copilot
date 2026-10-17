import {
  lazy,
  Suspense,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from '@tanstack/react-router';
const AgentRequest = lazy(() =>
  import('./components/AgentRequest').then((module) => ({ default: module.AgentRequest })),
);
import { checkedResponse, loadStore, storageKey, type Request, type Store } from './types';
import {
  savedViewSchema,
  type AgentResponse,
  type OperationalVisual,
  type ReadParameters,
  type SavedView,
  type Evidence,
} from './contracts';
type Focus = { visual: OperationalVisual; response: AgentResponse; definition?: SavedView };
type Sources = { evidence: Evidence[]; selected?: string };
function useModel() {
  const navigate = useNavigate();
  const [initial] = useState(loadStore);
  const [store, setStore] = useState(initial.store);
  const storeRef = useRef(store);
  storeRef.current = store;
  const [notice, setNotice] = useState(
    initial.blocked
      ? 'Stored history could not be read. It has been preserved; this session is temporary.'
      : '',
  );
  const [pending, setPending] = useState<Request | null>(null);
  const pendingRef = useRef<Request | null>(null);
  const abort = useRef<AbortController | null>(null);
  const focusTicket = useRef(0);
  const [dataset, setDataset] = useState<'fixture' | 'sample'>(
    () =>
      initial.store.threads
        .find((t) => t.id === initial.store.activeId)
        ?.entries.findLast((e) => e.response)?.response?.mode || 'fixture',
  );
  const [progress, setProgress] = useState('Reading the records');
  const [focus, setFocus] = useState<Focus | null>(null);
  const [sources, setSources] = useState<Sources | null>(null);
  const [save, setSave] = useState<Focus | null>(null);
  const [context, setContext] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState(false);
  const [freshReply, setFreshReply] = useState(false);
  function update(fn: (s: Store) => Store) {
    setStore((s) => {
      const next = fn(s);
      storeRef.current = next;
      return next;
    });
  }
  useEffect(() => {
    if (initial.blocked) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(store));
    } catch {
      setNotice('Browser storage is unavailable. Your current session is temporary.');
    }
  }, [store, initial.blocked]);
  function finish(id: string, response?: AgentResponse, error?: string) {
    const req = pendingRef.current;
    if (!req || req.id !== id) return;
    pendingRef.current = null;
    setPending(null);
    update((s) => ({
      ...s,
      threads: s.threads.map((t) =>
        t.id !== req.threadId
          ? t
          : {
              ...t,
              updatedAt: new Date().toISOString(),
              entries: t.entries.map((e) =>
                e.requestId === id && e.role === 'assistant'
                  ? {
                      ...e,
                      status: response ? 'ready' : 'failed',
                      text: response?.answer || error || 'Unable to finish.',
                      response,
                    }
                  : e,
              ),
            },
      ),
    }));
    if (response) {
      const ids = response.visuals[0]?.artifact.scope.wellIds;
      const single =
        ids?.length === 1
          ? ids[0]
          : response.parameters.wellId !== 'all'
            ? response.parameters.wellId
            : null;
      if (single) setContext(single);
    }
    if (req.fromFocus) setFreshReply(true);
  }
  function stop() {
    const req = pendingRef.current;
    if (!req) return;
    pendingRef.current = null;
    abort.current?.abort();
    setPending(null);
    update((s) => ({
      ...s,
      threads: s.threads.map((t) =>
        t.id !== req.threadId
          ? t
          : {
              ...t,
              entries: t.entries.map((e) =>
                e.requestId === req.id && e.role === 'assistant'
                  ? {
                      ...e,
                      status: 'stopped',
                      text: 'Investigation stopped. Earlier results remain available.',
                    }
                  : e,
              ),
            },
      ),
    }));
  }
  function begin(
    question: string,
    parameters: ReadParameters,
    kind: 'agent' | 'saved',
    fromFocus = false,
  ): Request {
    stop();
    const id = crypto.randomUUID();
    const threadId = storeRef.current.activeId;
    const req = { id, threadId, question, parameters, kind, fromFocus };
    pendingRef.current = req;
    setPending(req);
    setProgress('Reading the records');
    update((s) => ({
      ...s,
      threads: s.threads.map((t) =>
        t.id !== threadId
          ? t
          : {
              ...t,
              title: t.entries.length ? t.title : question.slice(0, 60),
              updatedAt: new Date().toISOString(),
              entries: [
                ...t.entries,
                {
                  id: crypto.randomUUID(),
                  requestId: id,
                  role: 'user',
                  text: question,
                  status: 'ready',
                },
                {
                  id: crypto.randomUUID(),
                  requestId: id,
                  role: 'assistant',
                  text: '',
                  status: 'pending',
                },
              ],
            },
      ),
    }));
    return req;
  }
  async function runView(
    definition: SavedView,
    parameters: ReadParameters = definition.parameters,
    openFocus = true,
  ) {
    setDataset(definition.parameters.dataset || 'fixture');
    const ticket = ++focusTicket.current;
    const req = begin(`Run ${definition.name}`, parameters, 'saved', !!focus);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const res = await fetch('/api/views/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: req.id, definition, parameters }),
        signal: controller.signal,
      });
      if (!res.ok) throw Error('read');
      const data = checkedResponse(await res.json(), req.id);
      if (pendingRef.current?.id !== req.id) return;
      finish(req.id, data);
      if (openFocus && ticket === focusTicket.current && data.visuals[0]) {
        setFocus({ visual: data.visuals[0], response: data, definition });
        setFreshReply(false);
      }
    } catch {
      if (pendingRef.current?.id === req.id)
        finish(
          req.id,
          undefined,
          'The saved view could not be refreshed. Previous results keep their original scope and date.',
        );
    }
  }
  function send(question: string, fromFocus = false) {
    const text = question.trim();
    if (!text) return;
    const explicit = /\b(?:LAB-)?W0?[1-6]\b/i.exec(text)?.[0];
    const wellId = explicit
      ? `LAB-W${explicit.match(/\d+/)?.[0].padStart(2, '0')}`
      : /\b(all|across|every|field)\b/i.test(text)
        ? 'all'
        : context || 'all';
    const named = /^(?:run|open|use)\s+(.+)$/i.exec(text);
    if (named) {
      const literal = named[1].trim();
      const definition =
        storeRef.current.views.find((v) => v.name.toLowerCase() === literal.toLowerCase()) ||
        storeRef.current.views.find(
          (v) => v.name.toLowerCase() === literal.replace(/[.!?]$/, '').toLowerCase(),
        );
      if (definition) {
        void runView(definition, definition.parameters, false);
        return;
      }
    }
    const scoped = fromFocus && focus ? focus.response.parameters : { dataset };
    const focusedWells = fromFocus && focus ? focus.visual.artifact.scope.wellIds : [];
    const isAll = /\b(all|across|every|field)\b/i.test(text);
    const parameters: ReadParameters = {
      ...(scoped || {}),
      wellId:
        explicit || isAll
          ? wellId
          : fromFocus
            ? context && focusedWells.includes(context)
              ? context
              : focusedWells.length === 1
                ? focusedWells[0]
                : 'all'
            : wellId,
    };
    delete parameters.wellIds;
    if (fromFocus && !explicit && !isAll && parameters.wellId === 'all' && focusedWells.length > 1)
      parameters.wellIds = focusedWells;
    begin(text, parameters, 'agent', fromFocus);
    if (!fromFocus) void navigate({ to: '/' });
  }
  function newChat() {
    stop();
    setFocus(null);
    setContext(null);
    setFreshReply(false);
    const id = crypto.randomUUID();
    update((s) => ({
      ...s,
      activeId: id,
      threads: [
        {
          id,
          title: 'New conversation',
          updatedAt: new Date().toISOString(),
          sample: false,
          entries: [],
        },
        ...s.threads,
      ],
    }));
    setMenu(false);
    void navigate({ to: '/' });
  }
  function activate(id: string) {
    const latest = storeRef.current.threads
      .find((t) => t.id === id)
      ?.entries.findLast((e) => e.response)?.response;
    if (latest) setDataset(latest.mode);
    stop();
    setFocus(null);
    setContext(null);
    setFreshReply(false);
    update((s) => ({ ...s, activeId: id }));
    setMenu(false);
    void navigate({ to: '/' });
  }
  function choose(visual: OperationalVisual, wellId: string) {
    setSelected((s) => ({ ...s, [`${visual.runId}:${visual.artifact.id}`]: wellId }));
    setContext(wellId);
  }
  function saveView(name: string): string | undefined {
    if (!save) return 'Select a result first.';
    if (initial.blocked)
      return 'Storage needs recovery before saving. Your existing history has been preserved.';
    if (storeRef.current.views.some((v) => v.name.toLowerCase() === name.trim().toLowerCase()))
      return 'A view with this name already exists.';
    const visual = save.visual;
    const scope = visual.artifact.scope;
    const parsed = savedViewSchema.safeParse({
      id: crypto.randomUUID(),
      revision: 1,
      name,
      kind: visual.artifact.kind,
      presentation: save.response.presentation,
      parameters: {
        ...save.response.parameters,
        wellId:
          ['series', 'correction'].includes(visual.artifact.kind) && scope.wellIds.length === 1
            ? scope.wellIds[0]
            : save.response.parameters.wellId,
        wellIds:
          ['series', 'correction'].includes(visual.artifact.kind) && scope.wellIds.length === 1
            ? undefined
            : save.response.parameters.wellIds,
        ...(scope.from && scope.to
          ? {
              from: save.response.parameters.from || scope.from,
              to: save.response.parameters.to || scope.to,
            }
          : {}),
      },
      createdAt: new Date().toISOString(),
    });
    if (!parsed.success) return 'Use a name between 1 and 80 characters.';
    const next = { ...storeRef.current, views: [...storeRef.current.views, parsed.data] };
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      return 'Browser storage is unavailable. The view was not saved.';
    }
    setStore(next);
    storeRef.current = next;
    setSave(null);
    return undefined;
  }
  useEffect(() => {
    if (!initial.sample) return;
    const timer = setTimeout(() => {
      if (!storeRef.current.threads[0].entries.length)
        send('Which wells need attention, and where are they?');
    }, 100);
    return () => clearTimeout(timer);
  }, []);
  function changeDataset(value: 'fixture' | 'sample') {
    stop();
    setDataset(value);
    newChat();
  }
  function closeFocus() {
    focusTicket.current++;
    setFocus(null);
    void navigate({ to: '/' });
  }
  return {
    dataset,
    changeDataset,
    store,
    pending,
    progress,
    notice,
    focus,
    setFocus,
    closeFocus,
    sources,
    setSources,
    save,
    setSave,
    saveView,
    context,
    setContext,
    selected,
    choose,
    menu,
    setMenu,
    freshReply,
    setFreshReply,
    send,
    stop,
    newChat,
    activate,
    runView,
    finish,
    setProgress,
  };
}
type Model = ReturnType<typeof useModel>;
const Workspace = createContext<Model | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const model = useModel();
  return (
    <Workspace.Provider value={model}>
      {children}
      <Suspense fallback={null}>
        {model.pending?.kind === 'agent' && (
          <AgentRequest
            key={model.pending.id}
            request={model.pending}
            onResult={(id, data) => model.finish(id, data)}
            onError={(id, message) => model.finish(id, undefined, message)}
            onProgress={(id, label) => {
              if (model.pending?.id === id) model.setProgress(label);
            }}
          />
        )}
      </Suspense>
    </Workspace.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(Workspace);
  if (!value) throw Error('Missing workspace');
  return value;
}
