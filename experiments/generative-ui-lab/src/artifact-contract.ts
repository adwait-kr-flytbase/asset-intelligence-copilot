import { z } from 'zod';

const id = z.string().min(1).max(100);
const text = z.string().min(1).max(1000);
const finite = z.number().finite();
export const artifactDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
    'Expected a valid calendar date',
  );
const date = artifactDateSchema;
const unique = (values: string[]) => new Set(values).size === values.length;
const sources = z.array(id).min(1).max(100).refine(unique, 'Duplicate source reference');
const scope = z
  .object({
    label: text,
    wellIds: z.array(id).min(1).max(100).refine(unique, 'Duplicate well reference'),
    from: date,
    to: date,
  })
  .strict()
  .refine((value) => value.from <= value.to, 'Reversed artifact date range');
const common = { id, title: text, scope, sourceIds: sources };
export const artifactSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        ...common,
        kind: z.literal('geo'),
        points: z
          .array(
            z
              .object({
                id,
                wellId: id,
                label: text,
                lat: finite.min(-90).max(90).nullable(),
                lon: finite.min(-180).max(180).nullable(),
                status: z.enum(['producing', 'below-threshold']),
                volumeBbl: finite.nonnegative(),
                eventDate: date.nullable(),
                sourceIds: sources,
              })
              .strict(),
          )
          .max(100),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('series'),
        unit: text,
        series: z
          .array(
            z
              .object({
                id,
                label: text,
                points: z.array(z.object({ date, value: finite.nullable() }).strict()).max(400),
              })
              .strict(),
          )
          .max(100),
        events: z.array(z.object({ id, date, label: text, sourceIds: sources }).strict()).max(100),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('ranking'),
        unit: text,
        metricLabel: text,
        items: z
          .array(z.object({ id, label: text, value: finite, sourceIds: sources }).strict())
          .max(100),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('matrix'),
        rows: z.array(z.object({ id, label: text }).strict()).max(100),
        columns: z.array(z.object({ id, label: text }).strict()).max(100),
        unit: text,
        cells: z
          .array(
            z
              .object({ rowId: id, columnId: id, value: finite.nullable(), sourceIds: sources })
              .strict(),
          )
          .max(10000),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('obligations'),
        items: z
          .array(
            z
              .object({
                id,
                wellId: id,
                title: text,
                status: z.enum(['breach', 'pending', 'compliant', 'unknown']),
                dueAt: date.nullable(),
                rule: text,
                observed: text,
                sourceIds: sources,
              })
              .strict(),
          )
          .max(100),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('timeline'),
        items: z
          .array(
            z
              .object({
                id,
                at: date,
                title: text,
                description: text,
                category: z.enum(['inspection', 'repair', 'spill', 'note', 'correction']),
                sourceIds: sources,
              })
              .strict(),
          )
          .max(400),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('claims'),
        items: z
          .array(
            z
              .object({
                id,
                wellId: id,
                author: text,
                at: date,
                text,
                status: z.enum(['observed', 'reported', 'disputed', 'corrected']),
                sourceIds: sources,
              })
              .strict(),
          )
          .max(200),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('correction'),
        recordId: id,
        field: text,
        original: z.string().max(1000),
        proposed: z.string().max(1000),
        unit: text,
        reason: text,
        impacts: z.array(text).max(20),
        state: z.enum(['proposed', 'accepted']),
      })
      .strict(),
  ])
  .superRefine((artifact, context) => {
    const issue = (message: string) => context.addIssue({ code: 'custom', message });
    const checkIds = (items: { id: string }[]) => {
      if (!unique(items.map((item) => item.id))) issue('Duplicate artifact item identifier');
    };
    const checkSources = (items: { sourceIds: string[] }[]) => {
      for (const item of items)
        for (const source of item.sourceIds)
          if (!artifact.sourceIds.includes(source))
            issue('Nested evidence must belong to artifact sources');
    };
    const checkDate = (value: string | null) => {
      if (value && (value < artifact.scope.from || value > artifact.scope.to))
        issue('Artifact date outside its scope');
    };
    const checkWell = (wellId: string) => {
      if (!artifact.scope.wellIds.includes(wellId)) issue('Artifact item well outside its scope');
    };
    if (artifact.kind === 'geo') {
      checkIds(artifact.points);
      checkSources(artifact.points);
      for (const point of artifact.points) {
        checkWell(point.wellId);
        checkDate(point.eventDate);
        if ((point.lat === null) !== (point.lon === null))
          issue('Geometry requires a complete coordinate pair or two nulls');
      }
    } else if (artifact.kind === 'series') {
      checkIds(artifact.series);
      checkIds(artifact.events);
      checkSources(artifact.events);
      for (const series of artifact.series) {
        let previous = '';
        for (const point of series.points) {
          checkDate(point.date);
          if (point.date <= previous) issue('Series dates must be unique and strictly increasing');
          previous = point.date;
        }
      }
      for (const event of artifact.events) checkDate(event.date);
    } else if (artifact.kind === 'matrix') {
      checkIds(artifact.rows);
      checkIds(artifact.columns);
      checkSources(artifact.cells);
      const cells = new Set<string>();
      for (const cell of artifact.cells) {
        const key = JSON.stringify([cell.rowId, cell.columnId]);
        if (
          cells.has(key) ||
          !artifact.rows.some((row) => row.id === cell.rowId) ||
          !artifact.columns.some((column) => column.id === cell.columnId)
        )
          issue('Duplicate matrix cell or unknown matrix axis');
        cells.add(key);
      }
      if (cells.size !== artifact.rows.length * artifact.columns.length)
        issue('Matrix must represent every axis pair; use null for missing values');
    } else if (artifact.kind !== 'correction') {
      checkIds(artifact.items);
      checkSources(artifact.items);
      for (const item of artifact.items) {
        if ('wellId' in item) checkWell(item.wellId);
        if ('at' in item) checkDate(item.at);
        if ('dueAt' in item) checkDate(item.dueAt);
      }
      if (
        artifact.kind === 'timeline' &&
        artifact.items.some((item, i) => i > 0 && item.at < artifact.items[i - 1].at)
      )
        issue('Timeline must be chronological');
    }
  });
export type Artifact = z.infer<typeof artifactSchema>;
