export type ComponentReference = { resultId: string; panelId: string };
export type ConversationComponent = ComponentReference & {
  title: string;
  kind: string;
  quantity: string;
  parameters: unknown;
  asOf: string;
  canSave: boolean;
};
/** Application-owned prior snapshots; agent sees descriptors and references, never generated component code. */
export type ConversationViewPort = {
  list: () => Promise<ConversationComponent[]>;
  resolve: (references: ComponentReference[]) => Promise<ConversationComponent[]>;
};
