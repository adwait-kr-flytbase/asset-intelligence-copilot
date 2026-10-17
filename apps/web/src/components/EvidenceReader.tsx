import type { AppEvidence, ApplicationResult } from '@repo/contracts';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import Markdown from './Markdown';

export function sourceTitle(source: AppEvidence): string {
  return source.path.endsWith('.md')
    ? source.excerpt.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim() ||
        source.label.split('/').at(-1) ||
        source.label
    : source.label;
}
export function sourceKind(source: AppEvidence): string {
  if (source.path.includes('/sops/')) return 'SOP';
  if (source.path.includes('/well-types/')) return 'Manual';
  if (source.path.includes('inspection')) return 'Inspection';
  if (source.path.includes('maintenance')) return 'Maintenance';
  if (source.path.includes('regulatory')) return 'Regulatory';
  if (source.path.includes('context')) return 'Context note';
  return source.path.endsWith('.md') ? 'Document' : 'Record';
}
export function sourceLocation(source: AppEvidence): string {
  const { line, startLine, endLine, jsonPointer } = source.locator;
  const parts: string[] = [];
  if (startLine)
    parts.push(
      endLine && endLine !== startLine ? `Lines ${startLine}–${endLine}` : `Line ${startLine}`,
    );
  else if (line) parts.push(`Line ${line}`);
  if (jsonPointer !== undefined) parts.push(jsonPointer || 'Document root');
  return parts.join(' · ') || 'Imported record';
}
/** Reviver context retains original decimal lexemes; fall back to original text on older engines. */
export function structuredExcerpt(text: string): Record<string, unknown> | null {
  if (!text.trimStart().startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(
      text,
      (_key: string, value: unknown, context?: { source: string }) => {
        if (typeof value !== 'number') return value;
        if (!context?.source) throw new Error('Exact numeric source unavailable');
        return context.source;
      },
    );
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
const fieldLabels: Record<string, string> = {
  inspected_at: 'Inspection time',
  ambient_temp_c: 'Ambient temperature (°C)',
  wellhead_temp_c: 'Wellhead temperature (°C)',
  spill_area_pct: 'Spill area (%)',
  spill_est_volume_bbl: 'Estimated spill volume (bbl)',
  inspector_user_id: 'Inspector',
};
const fieldName = (key: string) =>
  fieldLabels[key] ?? key.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
function RecordValue({ value }: { value: unknown }) {
  if (value === null) return <span className="record-null">Unknown</span>;
  if (value === '') return <span className="record-null">Empty</span>;
  if (Array.isArray(value))
    return value.length ? (
      <ul>
        {value.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Immutable source array order is retained exactly.
          <li key={`${index}:${String(item)}`}>
            <RecordValue value={item} />
          </li>
        ))}
      </ul>
    ) : (
      <span className="record-null">None recorded</span>
    );
  if (typeof value === 'object') return <RecordFields record={value as Record<string, unknown>} />;
  return <>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</>;
}
function RecordFields({ record }: { record: Record<string, unknown> }) {
  return (
    <dl className="record-fields">
      {Object.entries(record).map(([key, value]) => (
        <div key={key}>
          <dt>{fieldName(key)}</dt>
          <dd>
            <RecordValue value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
function SourceDetail({ source }: { source: AppEvidence }) {
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState('');
  const record = useMemo(() => structuredExcerpt(source.excerpt), [source.excerpt]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(source.excerpt);
      setCopied('Excerpt copied');
    } catch {
      setCopied('Copy unavailable. Select and copy the original text.');
    }
  }
  return (
    <article className="evidence-detail" aria-label={`Source: ${source.label}`}>
      <header className="evidence-detail-heading">
        <span className="source-kind">{sourceKind(source)}</span>
        <h3>{sourceTitle(source)}</h3>
        <p className="source-file">{source.path}</p>
        <p className="source-location">
          <Icon name="source" />
          {sourceLocation(source)}
        </p>
      </header>
      <div className="evidence-reading-tools">
        <button type="button" className="quiet" aria-pressed={raw} onClick={() => setRaw(!raw)}>
          {raw ? 'Readable view' : 'Original text'}
        </button>
        <button type="button" className="quiet" onClick={() => void copy()}>
          Copy excerpt
        </button>
        <span role="status">{copied}</span>
      </div>
      {source.excerptTruncated && (
        <p className="excerpt-notice">
          Partial excerpt. Only the portion provided with this answer is shown.
        </p>
      )}
      <div className="evidence-content">
        {!source.excerpt ? (
          <p>No excerpt was provided for this record.</p>
        ) : raw ? (
          <pre className="evidence-original">{source.excerpt}</pre>
        ) : record ? (
          <RecordFields record={record} />
        ) : source.path.endsWith('.md') ? (
          <Markdown text={source.excerpt.replace(/^#{1,2}\s+[^\n]+\n*/, '')} />
        ) : (
          <pre className="evidence-original">{source.excerpt}</pre>
        )}
      </div>
      <details className="evidence-provenance">
        <summary>Provenance & record details</summary>
        <dl>
          <dt>Record ID</dt>
          <dd>{source.recordId}</dd>
          <dt>Source version</dt>
          <dd>{source.sourceVersionId}</dd>
          <dt>File path</dt>
          <dd>{source.path}</dd>
          <dt>Location</dt>
          <dd>{sourceLocation(source)}</dd>
        </dl>
      </details>
    </article>
  );
}
export function EvidenceReader({
  result,
  ids,
  selected,
  onClose,
}: {
  result: ApplicationResult;
  ids?: string[];
  selected?: string;
  onClose: () => void;
}) {
  const records = useMemo(() => {
    const allowed = ids ? new Set(ids) : null;
    return allowed ? result.evidence.filter((source) => allowed.has(source.id)) : result.evidence;
  }, [result, ids]);
  const [active, setActive] = useState(selected || records[0]?.id || '');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(() =>
    Math.max(0, Math.floor(records.findIndex((source) => source.id === selected) / 40)),
  );
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const kinds = useMemo(() => [...new Set(records.map(sourceKind))], [records]);
  const filtered = useMemo(
    () =>
      records.filter(
        (source) =>
          (!kind || sourceKind(source) === kind) &&
          `${source.label} ${source.path} ${source.recordId} ${sourceTitle(source)}`
            .toLowerCase()
            .includes(deferredSearch),
      ),
    [records, kind, deferredSearch],
  );
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const evidence = records.find((source) => source.id === active);
  const visible = filtered.slice(page * 40, (page + 1) * 40);
  return (
    <>
      <header className="evidence-header">
        <div>
          <h2>Sources</h2>
          <p>
            {records.length} {records.length === 1 ? 'record' : 'records'} attached to this{' '}
            {ids ? 'view' : 'answer'} · As of {result.asOf.slice(0, 10)}
          </p>
        </div>
        <button type="button" className="icon-button" aria-label="Close sources" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      {records.length ? (
        <div className="evidence-workspace">
          <aside className="evidence-browser" aria-label="Browse sources">
            <div className="evidence-filters">
              <div className="search-field">
                <Icon name="search" />
                <input
                  aria-label="Search sources"
                  placeholder="Find a source…"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear source search"
                    onClick={() => {
                      setSearch('');
                      setPage(0);
                    }}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>
              <select
                aria-label="Source type"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value);
                  setPage(0);
                }}
              >
                <option value="">All source types</option>
                {kinds.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <section className="evidence-list" aria-label="Source records">
              {visible.map((source) => (
                <button
                  type="button"
                  className={`evidence-list-item ${source.id === active ? 'selected' : ''}`}
                  ref={source.id === active ? selectedRef : undefined}
                  key={source.id}
                  aria-pressed={source.id === active}
                  onClick={() => setActive(source.id)}
                >
                  <Icon name="source" />
                  <span>
                    <span className="source-kind">{sourceKind(source)}</span>
                    <strong>{sourceTitle(source)}</strong>
                    <small>{sourceLocation(source)}</small>
                  </span>
                  <Icon name="chevron" />
                </button>
              ))}
              {!filtered.length && (
                <p className="evidence-empty">No sources match. Try another name or source type.</p>
              )}
            </section>
            <footer className="evidence-list-footer">
              <span>
                {filtered.length
                  ? `${page * 40 + 1}–${Math.min((page + 1) * 40, filtered.length)} of ${filtered.length}`
                  : '0 sources'}
              </span>
              {filtered.length > 40 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous sources"
                    disabled={!page}
                    onClick={() => setPage(page - 1)}
                  >
                    <Icon name="back" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next sources"
                    disabled={(page + 1) * 40 >= filtered.length}
                    onClick={() => setPage(page + 1)}
                  >
                    <Icon name="chevron" />
                  </button>
                </>
              )}
            </footer>
          </aside>
          <div className="evidence-reader-scroll" key={evidence?.id}>
            {evidence ? (
              <SourceDetail source={evidence} />
            ) : (
              <p className="evidence-empty">Choose a source to read its excerpt.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="empty-state">No source records are attached to this view.</p>
      )}
      <footer className="evidence-footer">
        <Icon name="shield" />
        <span>Excerpts retained with this result. File references are not download links.</span>
      </footer>
    </>
  );
}
