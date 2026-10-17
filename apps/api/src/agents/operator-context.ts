export type OperatorMemory = {
  id: string;
  kind: 'replacement-report' | 'preference';
  visibility: 'shared' | 'private';
  assetId?: string;
  authorId: string;
  authorName: string;
  at: string;
  text: string;
  confidence: 'direct-report' | 'hearsay';
};
export type OperatorContextPort = {
  read(): Promise<{
    persona: { id: string; name: string; team: string; teamId: string; role: string };
    memories: OperatorMemory[];
  }>;
  remember(input: { kind: OperatorMemory['kind']; assetId?: string }): Promise<OperatorMemory>;
};
