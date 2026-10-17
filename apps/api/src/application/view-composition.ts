import type { ApplicationPanel, ApplicationResult } from '@repo/contracts';
import type { ComponentReference, ConversationComponent } from '../agents/conversation-views.js';
import { composePanels } from './compose-panels.js';
import type { ApplicationReadOutput } from './ports.js';
import { type Actor, ApplicationError, type createApplicationRepository } from './repository.js';

type Repository = ReturnType<typeof createApplicationRepository>;
export function componentDescriptor(
  result: ApplicationResult,
  panel: ApplicationPanel,
): ConversationComponent {
  return {
    resultId: result.id,
    panelId: panel.id,
    title: panel.title,
    kind: panel.kind,
    quantity: panel.resultBinding?.quantity ?? panel.recipe?.operation ?? panel.kind,
    parameters: panel.parameters,
    asOf: result.asOf,
    canSave: !!panel.recipe,
  };
}
export async function resolveViewComponents(
  repository: Repository,
  actor: Actor,
  conversationId: string,
  references: ComponentReference[],
) {
  const snapshots = new Map<string, ApplicationResult>();
  const selected = [];
  for (const reference of references) {
    let result = snapshots.get(reference.resultId);
    if (!result) {
      result = await repository.result(actor, reference.resultId);
      snapshots.set(reference.resultId, result);
    }
    if (result.conversationId !== conversationId)
      throw new ApplicationError(404, 'NOT_FOUND', 'Component is not in this conversation.');
    const panel = result.panels.find((panel) => panel.id === reference.panelId);
    if (!panel)
      throw new ApplicationError(
        404,
        'NOT_FOUND',
        'Component was not found in the selected result.',
      );
    selected.push({ result, panel });
  }
  return selected;
}
export function combineViewComponents(
  selected: { result: ApplicationResult; panel: ApplicationPanel }[],
  current?: ApplicationReadOutput,
): ApplicationReadOutput {
  const panels = composePanels([
    ...(current?.panels ?? []),
    ...selected.map(({ panel }) => structuredClone(panel)),
  ]);
  const evidence = [
    ...new Map(
      [...(current?.evidence ?? []), ...selected.flatMap(({ result }) => result.evidence)].map(
        (item) => [item.id, item],
      ),
    ).values(),
  ];
  const entityRefs = [
    ...new Map(
      [...(current?.entityRefs ?? []), ...selected.flatMap(({ result }) => result.entityRefs)].map(
        (item) => [item.id, item],
      ),
    ).values(),
  ];
  return {
    ...current,
    panels,
    evidence,
    entityRefs,
    warnings: [
      ...new Set([
        ...(current?.warnings ?? []),
        ...selected.flatMap(({ panel }) => panel.warnings),
      ]),
    ],
  };
}
