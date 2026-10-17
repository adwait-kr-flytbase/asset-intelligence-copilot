import type {
  ApplicationPanel,
  ApplicationResult,
  ReadParameters,
  ReadRecipe,
} from '@repo/contracts';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from '@tanstack/react-router';
import {
  createContext,
  lazy,
  type ReactNode,
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { api } from './api';
import {
  type ChatRequest,
  type Entry,
  messageEntry,
  type SavedView,
  type SavedViewSummary,
} from './types';

const AgentRequest = lazy(() =>
  import('./components/AgentRequest').then((module) => ({ default: module.AgentRequest })),
);
export type Focus = {
  result: ApplicationResult;
  panel: ApplicationPanel;
  definition?: SavedView;
  wholeView?: boolean;
};
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'The request could not finish.';
function useModel() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const routeId = useParams({ strict: false }).conversationId;
  const pathname = useLocation({ select: (location) => location.pathname });
  const session = useQuery({
    queryKey: ['session'],
    queryFn: ({ signal }) => api.getSession(signal),
    retry: false,
    staleTime: 0,
  });
  const persona = session.data?.persona ?? null;
  const namespace = session.data?.namespace ?? '';
  const actor = `${namespace}:${persona?.id ?? ''}`;
  const [activeOwner, setActiveOwner] = useState(actor);
  const requestOwner = useRef(actor);
  const actorRef = useRef(actor);
  actorRef.current = actor;
  const [switching, setSwitching] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pending, setPending] = useState<ChatRequest | null>(null);
  const pendingRef = useRef<ChatRequest | null>(null);
  const ticket = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState('Reading the records');
  const [notice, setNotice] = useState('');
  const [focus, setFocus] = useState<Focus | null>(null);
  const focusTicket = useRef(0);
  const [sources, setSources] = useState<{
    result: ApplicationResult;
    selected?: string;
    ids?: string[];
  } | null>(null);
  const [save, setSave] = useState<Focus | null>(null);
  const [context, setContext] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState(false);
  const [freshReply, setFreshReply] = useState(false);
  const personasQuery = useInfiniteQuery({
    queryKey: ['personas'],
    queryFn: ({ pageParam, signal }) => api.personas({ after: pageParam, limit: 30 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const conversationsQuery = useInfiniteQuery({
    queryKey: ['conversations', namespace, persona?.id],
    queryFn: ({ pageParam, signal }) => api.conversations({ after: pageParam, limit: 30 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!persona && !switching,
    retry: false,
  });
  const viewsQuery = useInfiniteQuery({
    queryKey: ['saved-views', namespace, persona?.id],
    queryFn: ({ pageParam, signal }) => api.savedViews({ after: pageParam, limit: 30 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!persona && !switching,
    retry: false,
  });
  const historyQuery = useInfiniteQuery({
    queryKey: ['conversation', namespace, persona?.id, activeId],
    queryFn: ({ pageParam, signal }) =>
      api.conversation(activeId ?? '', { before: pageParam, limit: 20 }, signal),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!persona && !!activeId && !switching,
    retry: false,
  });
  const conversations = conversationsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const views = viewsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  // Apply route changes only. Clearing a chat must not reactivate the URL that
  // is still visible while navigation to the new draft is committing.
  const routeActivation = useRef((_id: string | null) => {});
  routeActivation.current = (id: string | null) => {
    if (id === activeId) return;
    if (id && pendingRef.current?.conversationId === id) {
      setActiveId(id);
      return;
    }
    stop();
    setActiveId(id);
    setEntries([]);
    setFocus(null);
    setSources(null);
    setContext(null);
    setFreshReply(false);
    setMenu(false);
    focusTicket.current++;
  };
  useEffect(() => {
    if (switching || activeOwner !== actor) return;
    if (routeId || pathname === '/') routeActivation.current(routeId ?? null);
  }, [pathname, routeId, switching, activeOwner, actor]);
  useEffect(() => {
    if (pendingRef.current) return;
    const rows =
      historyQuery.data?.pages.toReversed().flatMap((page) => page.messages.map(messageEntry)) ??
      [];
    setEntries([...new Map(rows.map((row) => [row.id, row])).values()]);
  }, [historyQuery.data]);
  function stop() {
    const request = pendingRef.current;
    ticket.current++;
    controller.current?.abort();
    controller.current = null;
    pendingRef.current = null;
    setPending(null);
    if (request?.runId) void api.cancelRun(request.runId).catch(() => {});
    if (request)
      setEntries((current) =>
        current.map((entry) =>
          entry.id === `pending-${request.id}`
            ? {
                ...entry,
                status: 'stopped',
                text: 'Investigation stopped. Earlier results remain available.',
              }
            : entry,
        ),
      );
  }
  const resetIdentity = useRef(() => {});
  resetIdentity.current = () => {
    stop();
    setActiveId(null);
    setEntries([]);
    setFocus(null);
    setSources(null);
    setSave(null);
    setContext(null);
    setSelected({});
    setFreshReply(false);
    focusTicket.current++;
    setActiveOwner(actor);
  };
  useEffect(() => {
    if (activeOwner !== actor) resetIdentity.current();
  }, [activeOwner, actor]);
  async function selectPersona(id: string) {
    if (switching || id === persona?.id) return;
    stop();
    void navigate({ to: '/', replace: true });
    setSwitching(true);
    setNotice('');
    setActiveId(null);
    setEntries([]);
    setFocus(null);
    setSources(null);
    setSave(null);
    setContext(null);
    setSelected({});
    focusTicket.current++;
    try {
      await client.cancelQueries();
      const selectedPersona = await api.selectPersona(id);
      client.removeQueries({
        predicate: (q) => q.queryKey[0] !== 'session' && q.queryKey[0] !== 'personas',
      });
      client.setQueryData(['session'], (previous: typeof session.data) =>
        previous ? { ...previous, persona: selectedPersona.persona } : previous,
      );
      await session.refetch();
      void navigate({ to: '/' });
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSwitching(false);
    }
  }
  function newChat() {
    stop();
    setActiveId(null);
    setEntries([]);
    setFocus(null);
    setSources(null);
    setContext(null);
    setFreshReply(false);
    setMenu(false);
    focusTicket.current++;
    void navigate({ to: '/' });
  }
  function activate(id: string) {
    stop();
    setActiveId(id);
    setEntries([]);
    setFocus(null);
    setContext(null);
    setMenu(false);
    setFreshReply(false);
    focusTicket.current++;
    void navigate({ to: '/chats/$conversationId', params: { conversationId: id } });
  }
  const acceptResult = (result: ApplicationResult) => {
    client.setQueryData(['result', namespace, persona?.id, result.id], result);
  };
  function finish(id: string, result?: ApplicationResult, error?: string) {
    const request = pendingRef.current;
    if (!request || request.id !== id || requestOwner.current !== actorRef.current) return;
    if (result && result.conversationId !== request.conversationId) {
      error = 'The returned result did not match this conversation.';
      result = undefined;
    }
    pendingRef.current = null;
    setPending(null);
    if (result) acceptResult(result);
    setEntries((current) =>
      current.map((entry) =>
        entry.id === `pending-${id}`
          ? {
              ...entry,
              status: result ? 'ready' : 'failed',
              text: result?.text ?? error ?? 'No accepted result was returned.',
              ...(result ? { result, resultId: result.id } : {}),
            }
          : entry,
      ),
    );
    void client.invalidateQueries({ queryKey: ['conversations', namespace, persona?.id] });
    if (result?.conversationId)
      void client.invalidateQueries({
        queryKey: ['conversation', namespace, persona?.id, result.conversationId],
      });
    if (focus) setFreshReply(true);
  }
  function onRun(id: string, runId: string) {
    const request = pendingRef.current;
    if (request?.id !== id || requestOwner.current !== actorRef.current) return;
    request.runId = runId;
    setPending({ ...request });
  }
  async function send(question: string, fromFocus = false) {
    const text = question.trim();
    if (!text || !persona || switching) return;
    if (activeId && historyQuery.error) {
      setNotice(
        'This conversation is unavailable for the selected identity. Start a new conversation.',
      );
      return;
    }
    if (text.length > 7000) {
      setNotice('Keep the question under 7,000 characters.');
      return;
    }
    stop();
    const started = ticket.current;
    const owner = actorRef.current;
    requestOwner.current = owner;
    const id = crypto.randomUUID();
    const asset =
      context ??
      (fromFocus && focus?.panel.parameters.scope.kind === 'asset'
        ? focus.panel.parameters.scope.assetId
        : null);
    const submitted = asset ? `Asset context: ${asset}\n\n${text}` : text;
    const request: ChatRequest = { id, conversationId: activeId ?? '', question: submitted };
    pendingRef.current = request;
    setPending(request);
    setProgress('Reading the records');
    setNotice('');
    setEntries((current) => [
      ...current,
      { id: `user-${id}`, role: 'user', text: submitted, status: 'ready' },
      { id: `pending-${id}`, role: 'assistant', text: '', status: 'pending' },
    ]);
    if (!fromFocus)
      void navigate(
        activeId
          ? { to: '/chats/$conversationId', params: { conversationId: activeId } }
          : { to: '/' },
      );
    if (!activeId) {
      try {
        const conversation = await api.createConversation(text.slice(0, 100));
        if (
          ticket.current !== started ||
          actorRef.current !== owner ||
          pendingRef.current?.id !== id
        )
          return;
        request.conversationId = conversation.id;
        setActiveId(conversation.id);
        void navigate({
          to: '/chats/$conversationId',
          params: { conversationId: conversation.id },
          replace: true,
        });
        setPending({ ...request });
        void client.invalidateQueries({ queryKey: ['conversations', namespace, persona.id] });
      } catch (error) {
        if (pendingRef.current?.id === id) finish(id, undefined, errorMessage(error));
      }
    }
  }
  async function saveView(name: string): Promise<string | undefined> {
    if (!save) return 'Choose a view to save.';
    const panels = save.wholeView ? save.result.panels : [save.panel];
    if (!panels.length || panels.some((panel) => !panel.recipe))
      return 'Every component needs a supported saved read before this whole view can be saved.';
    const owner = actorRef.current;
    requestOwner.current = owner;
    const candidate = save;
    try {
      await api.saveView({
        sourceResultId: candidate.result.id,
        panelIds: panels.map((panel) => panel.id),
        name,
      });
      if (actorRef.current !== owner) return 'The active persona changed.';
      await client.invalidateQueries({ queryKey: ['saved-views', namespace, persona?.id] });
      setSave(null);
      return undefined;
    } catch (error) {
      return errorMessage(error);
    }
  }
  async function runView(
    view: SavedView | SavedViewSummary,
    parameters?: Partial<ReadParameters>,
    openFocus = true,
  ) {
    if (!persona || switching) return;
    stop();
    const owner = actorRef.current;
    requestOwner.current = owner;
    const started = ticket.current;
    const focusVersion = ++focusTicket.current;
    const abort = new AbortController();
    controller.current = abort;
    const id = crypto.randomUUID();
    const request = { id, conversationId: '', question: `Run ${view.name}` };
    pendingRef.current = request;
    setPending(request);
    setProgress('Refreshing saved records');
    setNotice('');
    try {
      const definition = 'definition' in view ? view : await api.savedView(view.id, abort.signal);
      const execution = await api.runView(
        view.id,
        { requestId: id, ...(parameters ? { parameters } : {}) },
        abort.signal,
      );
      if (actorRef.current !== owner || ticket.current !== started || pendingRef.current?.id !== id)
        return;
      acceptResult(execution.result);
      pendingRef.current = null;
      setPending(null);
      if (openFocus && focusVersion === focusTicket.current && execution.result.panels[0]) {
        setFocus({
          result: execution.result,
          panel: execution.result.panels[0],
          definition,
          wholeView: true,
        });
        setFreshReply(false);
      }
    } catch (error) {
      if (actorRef.current === owner && pendingRef.current?.id === id) {
        pendingRef.current = null;
        setPending(null);
        setNotice(errorMessage(error));
        throw error;
      }
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  }
  const latestViewEntry = [...entries]
    .reverse()
    .find(
      (entry) =>
        entry.role === 'assistant' && entry.status === 'ready' && (entry.resultId || entry.result),
    );
  const latestViewId = latestViewEntry?.result?.id ?? latestViewEntry?.resultId;
  const [composing, setComposing] = useState(false);
  async function addToLatestView(result: ApplicationResult, panel: ApplicationPanel) {
    if (
      !persona ||
      switching ||
      pendingRef.current ||
      composing ||
      !activeId ||
      !latestViewId ||
      result.id === latestViewId
    )
      return;
    const owner = actorRef.current;
    const started = ticket.current;
    const conversationId = activeId;
    const abort = new AbortController();
    controller.current = abort;
    setComposing(true);
    setNotice('');
    try {
      const latest = latestViewEntry?.result ?? (await api.getResult(latestViewId, abort.signal));
      const components = latest.panels.map((item) => ({ resultId: latest.id, panelId: item.id }));
      components.push({ resultId: result.id, panelId: panel.id });
      const execution = await api.compose(
        { requestId: crypto.randomUUID(), conversationId, components },
        abort.signal,
      );
      if (actorRef.current !== owner || ticket.current !== started) return;
      if (
        execution.result.conversationId !== conversationId ||
        execution.result.runId !== execution.run.id
      )
        throw new Error('The composed view did not match this conversation.');
      acceptResult(execution.result);
      setEntries((current) => [
        ...current,
        {
          id: `composed-${execution.result.id}`,
          role: 'assistant',
          status: 'ready',
          text: execution.result.text,
          resultId: execution.result.id,
          result: execution.result,
        },
      ]);
      if (focus) setFreshReply(true);
      void client.invalidateQueries({
        queryKey: ['conversation', namespace, persona.id, conversationId],
      });
      void client.invalidateQueries({ queryKey: ['conversations', namespace, persona.id] });
    } catch (error) {
      if (actorRef.current === owner && ticket.current === started) setNotice(errorMessage(error));
    } finally {
      if (controller.current === abort) controller.current = null;
      setComposing(false);
    }
  }
  async function readPanels(panels: { id: string; title: string; recipe: ReadRecipe }[]) {
    if (!persona || switching) return;
    stop();
    const owner = actorRef.current;
    requestOwner.current = owner;
    const started = ticket.current;
    const focusVersion = ++focusTicket.current;
    const abort = new AbortController();
    controller.current = abort;
    const id = crypto.randomUUID();
    pendingRef.current = { id, conversationId: '', question: 'Read operational records' };
    setPending(pendingRef.current);
    setProgress('Reading operational records');
    try {
      const execution = await api.read({ requestId: id, panels }, abort.signal);
      if (actorRef.current !== owner || ticket.current !== started || pendingRef.current?.id !== id)
        return;
      acceptResult(execution.result);
      pendingRef.current = null;
      setPending(null);
      if (focusVersion === focusTicket.current && execution.result.panels[0])
        setFocus({ result: execution.result, panel: execution.result.panels[0] });
    } catch (error) {
      if (actorRef.current === owner && pendingRef.current?.id === id) {
        pendingRef.current = null;
        setPending(null);
        setNotice(errorMessage(error));
      }
    }
  }
  function closeFocus() {
    focusTicket.current++;
    setFocus(null);
    void navigate(
      activeId
        ? { to: '/chats/$conversationId', params: { conversationId: activeId } }
        : { to: '/' },
    );
  }
  function choose(result: ApplicationResult, panel: ApplicationPanel, assetId: string) {
    setSelected((current) => ({ ...current, [`${result.id}:${panel.id}`]: assetId }));
    setContext(assetId);
  }
  const activeTitle =
    historyQuery.data?.pages[0]?.title ??
    conversations.find((item) => item.id === activeId)?.title ??
    'New conversation';
  const morePeople = useRef(() => {});
  morePeople.current = () => {
    void personasQuery.fetchNextPage();
  };
  useEffect(() => {
    if (
      personasQuery.hasNextPage &&
      !personasQuery.isFetchingNextPage &&
      !personasQuery.isFetchNextPageError
    )
      morePeople.current();
  }, [
    personasQuery.hasNextPage,
    personasQuery.isFetchingNextPage,
    personasQuery.isFetchNextPageError,
  ]);
  const importedPeople = personasQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const distinctPersonas = importedPeople;
  return {
    namespace,
    persona,
    personas: distinctPersonas,
    sessionLoading: session.isPending || switching || activeOwner !== actor,
    sessionError: session.error
      ? errorMessage(session.error)
      : personasQuery.error
        ? errorMessage(personasQuery.error)
        : null,
    selectPersona,
    morePersonas: () => void personasQuery.fetchNextPage(),
    hasMorePersonas: personasQuery.hasNextPage,
    conversations,
    conversationsLoading: conversationsQuery.isLoading,
    moreConversations: () => void conversationsQuery.fetchNextPage(),
    hasMoreConversations: conversationsQuery.hasNextPage,
    views,
    viewsLoading: viewsQuery.isLoading,
    moreViews: () => void viewsQuery.fetchNextPage(),
    hasMoreViews: viewsQuery.hasNextPage,
    activeId,
    activeTitle,
    entries: activeOwner === actor ? entries : [],
    historyLoading: historyQuery.isLoading,
    historyError: historyQuery.error ? errorMessage(historyQuery.error) : null,
    loadOlder: () => void historyQuery.fetchNextPage(),
    hasOlder: historyQuery.hasNextPage,
    pending,
    progress,
    notice:
      notice ||
      (conversationsQuery.error
        ? errorMessage(conversationsQuery.error)
        : viewsQuery.error
          ? errorMessage(viewsQuery.error)
          : ''),
    focus: activeOwner === actor ? focus : null,
    setFocus,
    closeFocus,
    sources: activeOwner === actor ? sources : null,
    setSources,
    save: activeOwner === actor ? save : null,
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
    readPanels,
    latestViewId,
    composing,
    addToLatestView,
    finish,
    onRun,
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
        {model.pending?.conversationId && (
          <AgentRequest
            key={model.pending.id}
            request={model.pending}
            onResult={model.finish}
            onError={(id, message) => model.finish(id, undefined, message)}
            onRun={model.onRun}
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
  if (!value) throw new Error('Missing workspace');
  return value;
}
