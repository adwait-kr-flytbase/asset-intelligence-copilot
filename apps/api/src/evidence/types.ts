export type Source = {
  id: string;
  label: string;
  path: string;
  sourceId: string;
  locator: { line: number } | { startLine: number; endLine: number };
};
export type Document = {
  id: string;
  kind: 'manual' | 'sop' | 'maintenance_report';
  assetId: string | null;
  markdown: string;
  source: Source;
  isPrimary?: boolean;
};
export type Observation = {
  id: string;
  observedAt: string;
  ambientC: string;
  wellheadC: string;
  inspector: string;
  method: string;
  notes: string;
  source: Source;
};
export type FieldNote = {
  id: string;
  type: string;
  inspectionId: string | null;
  text: string;
  author: string;
  createdAt: string;
  validFrom: string;
  validTo: string | null;
  source: Source;
};
export type OperationalContext = {
  asset: { id: string; name: string; wellType: string; recordedStatus: string; source: Source };
  observation: Observation | null;
  notes: FieldNote[];
  maintenance: {
    id: string;
    startedAt: string;
    completedAt: string;
    issue: string;
    action: string;
    reportId: string | null;
    inspectionId: string | null;
    source: Source;
  }[];
  maintenanceTruncated: boolean;
};
export type SearchInput = {
  query: string;
  assetId?: string;
  kind?: Document['kind'];
  limit: number;
};
/** Consumer-defined read port: no SQL, SDK, driver or browser types. */
export interface EvidenceReader {
  record?(
    kind: 'inspection' | 'maintenance' | 'regulatory' | 'note',
    id: string,
    signal?: AbortSignal,
  ): Promise<{ id: string; text: string; source: Source } | null>;
  context(assetId: string, asOf: string, signal?: AbortSignal): Promise<OperationalContext | null>;
  procedures(assetId: string, signal?: AbortSignal): Promise<Document[]>;
  readDocument(id: string, signal?: AbortSignal): Promise<Document | null>;
  search(
    input: SearchInput,
    signal?: AbortSignal,
  ): Promise<{
    hits: Document[];
    coverage: 'ranked-discovery';
    limit: number;
    warnings?: string[];
  }>;
}
