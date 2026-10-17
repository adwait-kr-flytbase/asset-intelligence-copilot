import { getTableName } from 'drizzle-orm';
import {
  type AnyPgColumn,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';
export const fields = pgTable('fields', { id: text().primaryKey() });
export const identity = () => ({
  namespace: text()
    .notNull()
    .references(() => fields.id),
  id: text().notNull(),
});
export const fk = (
  columns: [AnyPgColumn, ...AnyPgColumn[]],
  foreignColumns: [AnyPgColumn, ...AnyPgColumn[]],
  name: string,
) => foreignKey({ columns, foreignColumns, name });
export const sourceFiles = pgTable(
  'source_files',
  {
    ...identity(),
    path: text().notNull(),
    contentHash: text('content_hash').notNull(),
    content: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.id] }),
    unique('source_version_path').on(t.namespace, t.id, t.path),
  ],
);
export const original = () => ({
  sourceId: text('source_id').notNull(),
  sourcePath: text('source_path').notNull(),
  sourceLine: integer('source_line'),
  sourcePointer: text('source_pointer'),
  raw: jsonb().notNull(),
});
export const base = () => ({ ...identity(), ...original() });
export const baseKeys = (t: {
  namespace: AnyPgColumn;
  id: AnyPgColumn;
  sourceId: AnyPgColumn;
  sourcePath: AnyPgColumn;
}) => [
  primaryKey({ columns: [t.namespace, t.id] }),
  fk(
    [t.namespace, t.sourceId, t.sourcePath],
    [sourceFiles.namespace, sourceFiles.id, sourceFiles.path],
    `source_${getTableName(t.id.table)}_fk`,
  ),
];
