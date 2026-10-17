import {
  A2uiSurface,
  createComponentImplementation,
  type ReactCatalogComponent,
} from '@a2ui/react/v0_9';
import {
  Catalog,
  ColumnApi,
  MessageProcessor,
  STRICT_VALIDATION,
  type SurfaceModel,
} from '@a2ui/web_core/v0_9';
import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { CATALOG_ID, PROTOCOL, type Snapshot, viewSchema } from './protocol';
import { OperationalView } from './widgets';

const layout = createComponentImplementation(ColumnApi, ({ props, buildChild }) => (
  <div className="canvas-grid">
    {Array.isArray(props.children)
      ? props.children.map((child) => {
          const id = typeof child === 'string' ? child : child.id;
          return (
            <div className="a2ui-child" key={id}>
              {buildChild(id, typeof child === 'string' ? undefined : child.basePath)}
            </div>
          );
        })
      : null}
  </div>
));
const viewApi = {
  name: 'DataView',
  schema: z
    .object({
      kind: viewSchema,
      resultId: z.union([z.string(), z.object({ path: z.literal('/resultId') }).strict()]),
    })
    .strict(),
};
const view = createComponentImplementation(viewApi, ({ props, context }) => (
  <OperationalView
    kind={props.kind}
    resultId={props.resultId}
    dispatch={(name, payload) => {
      void context.dispatchAction({ event: { name, context: payload } });
    }}
  />
));
const catalog = new Catalog<ReactCatalogComponent>(CATALOG_ID, PROTOCOL, [layout, view]);
export function A2UIRenderer({
  snapshot,
  onAction,
  onError,
}: {
  snapshot: Snapshot;
  onAction: (name: string, data: Record<string, unknown>) => void;
  onError: (message: string) => void;
}) {
  const actionRef = useRef(onAction);
  actionRef.current = onAction;
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const processor = useMemo(
    () =>
      new MessageProcessor<ReactCatalogComponent>(
        [catalog],
        (action) => {
          actionRef.current(action.name, action.context);
        },
        { version: PROTOCOL, validationConfig: { ...STRICT_VALIDATION, targetVersion: PROTOCOL } },
      ),
    [],
  );
  const processed = useRef(0);
  const [surface, setSurface] = useState<SurfaceModel<ReactCatalogComponent>>();
  useEffect(() => {
    processed.current = 0;
    setSurface(undefined);
    return () => processor.dispose();
  }, [processor]);
  useEffect(() => {
    try {
      processor.processMessages(
        snapshot.wire.slice(processed.current) as Parameters<typeof processor.processMessages>[0],
      );
      processed.current = snapshot.wire.length;
      setSurface(processor.getSurface(snapshot.runId));
    } catch {
      errorRef.current(
        'A2UI rejected this surface. Switch to direct rendering or rerun the investigation.',
      );
    }
  }, [snapshot, processor]);
  return surface ? (
    <A2uiSurface surface={surface} />
  ) : (
    <p className="canvas-loading" role="status">
      Preparing validated A2UI surface…
    </p>
  );
}
export function DirectRenderer({ snapshot }: { snapshot: Snapshot }) {
  const views =
    snapshot.phase === 'partial' ? snapshot.plan.views.slice(0, 2) : snapshot.plan.views;
  return (
    <div className="canvas-grid">
      {views.map((kind) => (
        <OperationalView key={kind} kind={kind} resultId={snapshot.result.id} />
      ))}
    </div>
  );
}
export class RendererBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? (
      <p role="alert">This renderer failed safely. Switch renderer or rerun to recover.</p>
    ) : (
      this.props.children
    );
  }
}
