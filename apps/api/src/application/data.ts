import {
  type ApplicationPanel,
  panelSchema,
  type ReadRecipe,
  readRecipeSchema,
} from '@repo/contracts';
import type { DatabaseConnection } from '@repo/db';
import { z } from 'zod';
import { resultIntegrity } from '../agents/result-integrity.js';
import type { AnalysisInput } from '../evidence/analytics.js';
import { createSnapshotServices } from '../evidence/snapshot.js';
import type { Source } from '../evidence/types.js';
import { createEvidenceHydrator, sourceSchema } from './evidence.js';
import {
  makeAnalysisPanel,
  type PanelDescriptor,
  parametersFor,
  parseAnalysis,
  point,
} from './panels.js';
import type { ApplicationReadOutput, ExecutionContext, ReadExecutor } from './ports.js';

export const READ_OPERATIONS = [
  { operation: 'current-status', presentations: ['status', 'table'] },
  { operation: 'temperature-history', presentations: ['table', 'series'] },
  { operation: 'downtime', presentations: ['table', 'ranking'] },
  { operation: 'spills', presentations: ['table', 'geo', 'matrix'] },
  { operation: 'repair-costs', presentations: ['table', 'ranking'] },
  { operation: 'repeat-repairs', presentations: ['table', 'ranking'] },
] as const;
const overviewSchema = z.object({
  status: z.literal('found'),
  asset: z.object({ id: z.string(), recordedStatus: z.string(), source: sourceSchema }),
  observation: z.object({ observedAt: z.iso.datetime() }).nullable(),
  production: z
    .object({ producing: z.boolean(), deltaC: z.string(), thresholdC: z.string() })
    .nullable(),
  sources: z.array(sourceSchema),
  warnings: z.array(z.string()),
});

export function createApplicationData(connection: DatabaseConnection) {
  const hydrate = createEvidenceHydrator(connection);
  async function adaptAnalysis(
    input: AnalysisInput,
    raw: unknown,
    descriptor: PanelDescriptor,
    context: ExecutionContext,
  ): Promise<ApplicationReadOutput> {
    const output = parseAnalysis(input, raw);
    const locationSources = new Map<string, Source>();
    // Coordinates and their source versions came from the same domain snapshot.
    for (const row of output.rows)
      if ('assetId' in row) {
        const location = row.sources.find((source) => source.id === row.assetId);
        if (location) locationSources.set(row.assetId, location);
      }
    const evidence = await hydrate(
      [
        ...output.sources,
        ...(output.correctionAudit?.flatMap((change) => change.sources) ?? []),
        ...output.rows.flatMap((row) => row.sources),
        ...locationSources.values(),
      ],
      context,
    );
    const panel = panelSchema.parse(
      makeAnalysisPanel(input, output, descriptor, evidence, locationSources),
    );
    return {
      panels: [panel],
      evidence,
      entityRefs: [
        ...new Set(output.rows.flatMap((row) => ('assetId' in row ? [row.assetId] : []))),
      ].map((id) => ({ type: 'asset', id })),
      warnings: [],
    };
  }
  async function adaptStatus(
    raw: unknown,
    descriptor: PanelDescriptor,
    context: ExecutionContext,
  ): Promise<ApplicationReadOutput> {
    const result = overviewSchema.parse(raw);
    const evidence = await hydrate(result.sources, context);
    const panel: ApplicationPanel = {
      id: descriptor.id,
      title: descriptor.title,
      kind: 'status',
      state: 'ready',
      parameters: { scope: { kind: 'asset', assetId: result.asset.id }, limit: 1 },
      recipe: {
        operation: 'current-status',
        presentation: 'status',
        parameters: { scope: { kind: 'asset', assetId: result.asset.id }, limit: 1 },
      },
      resultBinding: {
        resultId: descriptor.result?.id ?? descriptor.id,
        ...(descriptor.result?.integrity ??
          resultIntegrity('getOperationalContext', { assetId: result.asset.id }, raw)),
        operation: 'getOperationalContext',
        metric: 'current-status',
        quantity: 'measured-production-classification',
        timeZone: 'UTC',
        nullPolicy: 'unknown-not-zero',
      },
      columns: [],
      rows: [],
      evidenceIds: evidence.map((item) => item.id),
      warnings: result.warnings,
      coverage: {
        kind: 'latest-operational-context',
        assetsEvaluated: 1,
        totalRows: 1,
        returnedRows: 1,
        truncated: false,
      },
      status: {
        assetId: result.asset.id,
        producing: result.production?.producing ?? null,
        deltaC: result.production?.deltaC ?? null,
        thresholdC: result.production?.thresholdC ?? null,
        observedAt: result.observation?.observedAt ?? null,
        recordedStatus: result.asset.recordedStatus,
      },
    };
    return {
      panels: [panelSchema.parse(panel)],
      evidence,
      entityRefs: [{ type: 'asset', id: result.asset.id }],
      warnings: [],
    };
  }
  const read: ReadExecutor = async (descriptors, context) => {
    context.signal.throwIfAborted();
    const { analytics, evidence: evidenceService } = createSnapshotServices(
      connection.pool,
      context.namespace,
      context.asOf,
    );
    const aggregate: ApplicationReadOutput = {
      panels: [],
      evidence: [],
      entityRefs: [],
      warnings: [],
    };
    for (const descriptor of descriptors) {
      const recipe: ReadRecipe = readRecipeSchema.parse(descriptor.recipe);
      const registry = READ_OPERATIONS.find((item) => item.operation === recipe.operation);
      const parameters = recipe.parameters;
      const input: AnalysisInput = {
        metric: recipe.operation,
        ...(parameters.scope.kind === 'asset'
          ? { assetId: parameters.scope.assetId }
          : parameters.scope.kind === 'area'
            ? { area: parameters.scope.area }
            : {}),
        window: parameters.window,
        limit: parameters.limit,
        equipmentKind: parameters.equipmentKind,
        groupBy: recipe.groupBy ?? (recipe.presentation === 'matrix' ? 'area-month' : undefined),
      };
      if (
        !registry ||
        (recipe.operation === 'current-status' && !!parameters.window) ||
        (recipe.presentation === 'matrix' && recipe.groupBy === 'asset') ||
        !(registry.presentations as readonly string[]).includes(recipe.presentation) ||
        (recipe.operation === 'spills' &&
          recipe.groupBy === 'area-month' &&
          recipe.presentation !== 'matrix' &&
          recipe.presentation !== 'table')
      ) {
        aggregate.panels.push({
          id: descriptor.id,
          title: descriptor.title,
          kind: recipe.presentation,
          state: 'unavailable',
          parameters: parametersFor(input),
          columns: [],
          rows: [],
          evidenceIds: [],
          warnings: ['This operation/presentation combination is unavailable.'],
          coverage: { kind: 'not-executed', totalRows: 0, returnedRows: 0, truncated: false },
          recipe,
        });
        continue;
      }
      try {
        const result =
          recipe.operation === 'current-status' &&
          recipe.presentation === 'status' &&
          parameters.scope.kind === 'asset'
            ? await adaptStatus(
                await evidenceService.overview(parameters.scope.assetId, context.signal),
                descriptor,
                context,
              )
            : await adaptAnalysis(
                input,
                await analytics.analyze(input, context.signal),
                { ...descriptor, recipe },
                context,
              );
        aggregate.panels.push(...result.panels);
        aggregate.evidence.push(...result.evidence);
        aggregate.entityRefs.push(...result.entityRefs);
        aggregate.warnings.push(...result.warnings);
      } catch {
        context.signal.throwIfAborted();
        aggregate.panels.push({
          id: descriptor.id,
          title: descriptor.title,
          kind: recipe.presentation,
          state: 'failed',
          parameters: parametersFor(input),
          columns: [],
          rows: [],
          evidenceIds: [],
          warnings: ['The read could not be completed with retained evidence.'],
          coverage: { kind: 'not-evaluated', totalRows: 0, returnedRows: 0, truncated: false },
          recipe,
        });
      }
    }
    aggregate.evidence = [...new Map(aggregate.evidence.map((item) => [item.id, item])).values()];
    aggregate.entityRefs = [
      ...new Map(aggregate.entityRefs.map((item) => [item.id, item])).values(),
    ];
    return aggregate;
  };
  return {
    read,
    hydrate,
    adaptAnalysis,
    adaptStatus,
    async personas(namespace: string, options: { after?: string; limit: number } = { limit: 30 }) {
      const result = await connection.pool.query<{
        id: string;
        name: string;
        role: string;
        teamId: string;
        team: string;
      }>(
        'SELECT u.id,u.name,u.role,u.team_id AS "teamId",t.name AS team FROM users u JOIN teams t ON t.namespace=u.namespace AND t.id=u.team_id WHERE u.namespace=$1 AND ($2::text IS NULL OR u.id>$2) ORDER BY u.id LIMIT $3',
        [namespace, options.after ?? null, options.limit + 1],
      );
      const items = result.rows.slice(0, options.limit);
      return {
        items,
        nextCursor: result.rows.length > options.limit ? (items.at(-1)?.id ?? null) : null,
      };
    },
    async persona(namespace: string, id: string) {
      const result = await connection.pool.query(
        'SELECT u.id,u.name,u.role,u.team_id AS "teamId",t.name AS team FROM users u JOIN teams t ON t.namespace=u.namespace AND t.id=u.team_id WHERE u.namespace=$1 AND u.id=$2',
        [namespace, id],
      );
      return result.rows[0] as
        | { id: string; name: string; role: string; teamId: string; team: string }
        | undefined;
    },
    async areas(namespace: string, options: { after?: string; limit: number } = { limit: 30 }) {
      const result = await connection.pool.query<{
        id: string;
        name: string;
        teamId: string;
        lat: string;
        lon: string;
        assetCount: number;
      }>(
        'SELECT a.id,a.name,a.team_id AS "teamId",a.lat,a.lon,(SELECT count(*)::integer FROM assets s WHERE s.namespace=a.namespace AND s.area_id=a.id) AS "assetCount" FROM areas a WHERE a.namespace=$1 AND ($2::text IS NULL OR a.id>$2) ORDER BY a.id LIMIT $3',
        [namespace, options.after ?? null, options.limit + 1],
      );
      const items = result.rows
        .slice(0, options.limit)
        .map(({ lat, lon, ...row }) => ({ ...row, center: point(lon, lat) }));
      return {
        items,
        nextCursor: result.rows.length > options.limit ? (items.at(-1)?.id ?? null) : null,
      };
    },
    async assets(namespace: string, options: { area?: string; after?: string; limit: number }) {
      if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 500)
        throw new Error('Asset limit must be between 1 and 500.');
      const result = await connection.pool.query<{
        id: string;
        name: string;
        wellType: string;
        areaId: string;
        area: string;
        lat: string;
        lon: string;
      }>(
        'SELECT a.id,a.name,a.well_type AS "wellType",a.area_id AS "areaId",ar.name AS area,a.lat,a.lon FROM assets a JOIN areas ar ON ar.namespace=a.namespace AND ar.id=a.area_id WHERE a.namespace=$1 AND ($2::text IS NULL OR a.area_id=$2 OR lower(ar.name)=lower($2)) AND ($3::text IS NULL OR a.id>$3) ORDER BY a.id LIMIT $4',
        [namespace, options.area ?? null, options.after ?? null, options.limit + 1],
      );
      const items = result.rows
        .slice(0, options.limit)
        .map(({ lat, lon, ...row }) => ({ ...row, geometry: point(lon, lat) }));
      return {
        items,
        nextCursor: result.rows.length > options.limit ? (items.at(-1)?.id ?? null) : null,
      };
    },
  };
}
export type ApplicationData = ReturnType<typeof createApplicationData>;
