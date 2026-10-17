import { createHash } from 'node:crypto';
import type { AppEvidence } from '@repo/contracts';
import type { DatabaseConnection } from '@repo/db';
import { z } from 'zod';
import type { Source } from '../evidence/types.js';
import { indexJsonSpans } from './json-spans.js';
import type { ExecutionContext } from './ports.js';

const tupleKey = (...values: unknown[]) => JSON.stringify(values);

export const sourceSchema = z.object({
  id: z.string().min(1).max(512),
  label: z.string().min(1).max(512),
  path: z.string().min(1).max(512),
  sourceId: z.string().min(1).max(512),
  locator: z.union([
    z.object({ line: z.number().int().positive() }),
    z.object({ startLine: z.number().int().positive(), endLine: z.number().int().positive() }),
  ]),
});

/** Source paths only bind retained database versions; they are never filesystem instructions. */
export function createEvidenceHydrator(connection: DatabaseConnection) {
  return async (sources: Source[], context: ExecutionContext): Promise<AppEvidence[]> => {
    context.signal.throwIfAborted();
    const unique = new Map<string, Source>();
    for (const source of sources)
      unique.set(tupleKey(source.id, source.sourceId, source.path, source.locator), source);
    const validated = [...unique.values()].map((source) => sourceSchema.parse(source));
    if (!validated.length) return [];
    const versions = await connection.pool.query<{ id: string; path: string; content: string }>(
      'SELECT id,path,content FROM source_files WHERE namespace=$1 AND id=ANY($2::text[])',
      [context.namespace, [...new Set(validated.map((source) => source.sourceId))]],
    );
    const metadata = await connection.pool.query<{
      id: string;
      source_id: string;
      source_path: string;
      source_line: number | null;
      source_pointer: string | null;
    }>(
      `SELECT id,source_id,source_path,source_line,source_pointer FROM assets WHERE namespace=$1 AND id=ANY($2::text[])
       UNION ALL SELECT id,source_id,source_path,source_line,source_pointer FROM areas WHERE namespace=$1 AND id=ANY($2::text[])
       UNION ALL SELECT id,source_id,source_path,source_line,source_pointer FROM users WHERE namespace=$1 AND id=ANY($2::text[])
       UNION ALL SELECT id,source_id,source_path,source_line,source_pointer FROM teams WHERE namespace=$1 AND id=ANY($2::text[])
       UNION ALL SELECT id,source_id,source_path,source_line,source_pointer FROM inspections WHERE namespace=$1 AND id=ANY($2::text[])
       UNION ALL SELECT id,source_id,source_path,source_line,source_pointer FROM maintenance WHERE namespace=$1 AND id=ANY($2::text[])
       UNION ALL SELECT id,source_id,source_path,source_line,source_pointer FROM regulatory_events WHERE namespace=$1 AND id=ANY($2::text[])
       UNION ALL SELECT id,source_id,source_path,source_line,source_pointer FROM context WHERE namespace=$1 AND id=ANY($2::text[])`,
      [context.namespace, [...new Set(validated.map((source) => source.id))]],
    );
    context.signal.throwIfAborted();
    const versionIndex = new Map(versions.rows.map((row) => [tupleKey(row.id, row.path), row]));
    const metadataIndex = new Map(
      metadata.rows.map((row) => [tupleKey(row.id, row.source_id, row.source_path), row]),
    );
    const lineCache = new Map<string, string[]>();
    const jsonCache = new Map<string, ReturnType<typeof indexJsonSpans>>();
    const jsonTargets = new Map<string, Set<string>>();
    for (const source of validated) {
      if (!versionIndex.has(tupleKey(source.sourceId, source.path)))
        throw new Error('Retained source version is unavailable.');
      if (!source.path.toLowerCase().endsWith('.json')) continue;
      const original = metadataIndex.get(tupleKey(source.id, source.sourceId, source.path));
      if (!original) throw new Error('JSON evidence locator is unavailable.');
      const key = tupleKey(source.sourceId, source.path);
      let targets = jsonTargets.get(key);
      if (!targets) {
        targets = new Set();
        jsonTargets.set(key, targets);
      }
      targets.add(original.source_pointer ?? '');
    }
    const result = new Map<string, AppEvidence>();
    for (const source of validated) {
      const versionKey = tupleKey(source.sourceId, source.path);
      const version = versionIndex.get(versionKey);
      if (!version) throw new Error('Retained source version is unavailable.');
      const original = metadataIndex.get(tupleKey(source.id, source.sourceId, source.path));
      let locator: AppEvidence['locator'];
      let excerpt: string;
      if (source.path.toLowerCase().endsWith('.json')) {
        if (!original) throw new Error('JSON evidence locator is unavailable.');
        const pointer = original.source_pointer ?? '';
        locator = { jsonPointer: pointer };
        if (!pointer) excerpt = version.content;
        else {
          let spans = jsonCache.get(versionKey);
          if (!spans) {
            spans = indexJsonSpans(version.content, jsonTargets.get(versionKey) ?? new Set());
            jsonCache.set(versionKey, spans);
          }
          const span = spans.get(pointer);
          if (!span) throw new Error('JSON evidence pointer is unavailable.');
          excerpt = version.content.slice(span.start, span.end);
        }
      } else {
        let lines = lineCache.get(versionKey);
        if (!lines) {
          lines = version.content.split('\n');
          lineCache.set(versionKey, lines);
        }
        if (source.path.toLowerCase().endsWith('.jsonl')) {
          if (
            !original?.source_line ||
            !('line' in source.locator) ||
            source.locator.line !== original.source_line
          )
            throw new Error('JSONL evidence locator mismatch.');
          locator = { line: original.source_line };
          excerpt = lines[original.source_line - 1] ?? '';
        } else {
          const start = 'line' in source.locator ? source.locator.line : source.locator.startLine;
          const end = 'line' in source.locator ? source.locator.line : source.locator.endLine;
          if (end < start || end > lines.length) throw new Error('Evidence span is unavailable.');
          locator = { startLine: start, endLine: end };
          excerpt = lines.slice(start - 1, end).join('\n');
        }
      }
      const id = createHash('sha256')
        .update(JSON.stringify([context.namespace, source.id, source.sourceId, locator]))
        .digest('hex');
      result.set(id, {
        id,
        recordId: source.id,
        sourceVersionId: source.sourceId,
        label: source.label,
        path: source.path,
        locator,
        excerpt: excerpt.slice(0, 12000),
        excerptTruncated: excerpt.length > 12000,
      });
    }
    return [...result.values()];
  };
}

const evidenceIndexCache = new WeakMap<AppEvidence[], Map<string, string[]>>();

/** Build one lookup per immutable hydration batch, reused across all panel rows. */
export function evidenceIds(sources: Source[], evidence: AppEvidence[]) {
  let index = evidenceIndexCache.get(evidence);
  if (!index) {
    index = new Map();
    for (const item of evidence) {
      const key = tupleKey(item.recordId, item.sourceVersionId);
      let ids = index.get(key);
      if (!ids) {
        ids = [];
        index.set(key, ids);
      }
      ids.push(item.id);
    }
    evidenceIndexCache.set(evidence, index);
  }
  const ids = new Set<string>();
  for (const source of sources)
    for (const id of index.get(tupleKey(source.id, source.sourceId)) ?? []) ids.add(id);
  return [...ids];
}
