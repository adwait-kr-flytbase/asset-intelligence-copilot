import type { Artifact } from './artifact-contract';
import type { ViewKind } from './protocol';

const artifactKinds: Partial<Record<ViewKind, Artifact['kind']>> = {
  map: 'geo',
  line: 'series',
  bar: 'ranking',
  costs: 'ranking',
  heatmap: 'matrix',
  obligations: 'obligations',
  timeline: 'timeline',
  claims: 'claims',
  correction: 'correction',
};

// A view is a read recipe: costs and bar must never bind the same ranking by accident.
export function resolveArtifactForView(
  artifacts: readonly Artifact[] | undefined,
  view: ViewKind,
  selected?: string,
): Artifact | undefined {
  const candidates = (artifacts || []).filter(
    (artifact) =>
      artifact.kind === artifactKinds[view] &&
      (view === 'costs'
        ? artifact.id === 'repair-costs'
        : view === 'bar'
          ? artifact.id !== 'repair-costs'
          : true),
  );
  return (
    candidates.find(
      (artifact) => artifact.scope.wellIds.length === 1 && artifact.scope.wellIds[0] === selected,
    ) || candidates[0]
  );
}

// Save confirmation describes the bound data. Callers retain legacy copy only when unbound.
export function getArtifactPanelDetails(
  artifacts: readonly Artifact[] | undefined,
  view: ViewKind,
  selected?: string,
): { title: string; description: string } | undefined {
  const artifact = resolveArtifactForView(artifacts, view, selected);
  if (!artifact) return undefined;
  let description: string;
  switch (artifact.kind) {
    case 'series':
      description = `${artifact.series.map((series) => series.label).join(' and ')} in ${artifact.unit}. ${artifact.scope.label}.`;
      break;
    case 'ranking':
      description = `${artifact.metricLabel} in ${artifact.unit}, with supporting records. ${artifact.scope.label}.`;
      break;
    case 'matrix':
      description = `Cell values in ${artifact.unit}, with row and column evidence. ${artifact.scope.label}.`;
      break;
    case 'geo':
      description = `Locations and recorded spill volumes in bbl; missing coordinates remain explicit. ${artifact.scope.label}.`;
      break;
    case 'obligations':
      description = `Supplied statuses, rules and deadlines. ${artifact.scope.label}.`;
      break;
    case 'timeline':
      description = `Dated events and their supporting records. ${artifact.scope.label}.`;
      break;
    case 'claims':
      description = `Attributed reports and measured observations with evidence. ${artifact.scope.label}.`;
      break;
    case 'correction':
      description = `Original and proposed values in ${artifact.unit}; read-only review. ${artifact.scope.label}.`;
      break;
  }
  return { title: artifact.title, description };
}
