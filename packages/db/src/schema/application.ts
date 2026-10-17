import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { fields, fk } from './common.js';
import { users } from './fleet.js';

const identity = () => ({
  namespace: text()
    .notNull()
    .references(() => fields.id),
  id: text().notNull(),
  ownerId: text('owner_id').notNull(),
});
const times = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
export const applicationConversations = pgTable(
  'application_conversations',
  {
    ...identity(),
    title: text().notNull(),
    revision: integer().notNull().default(0),
    ...times(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.id] }),
    unique('app_conversation_owner').on(t.namespace, t.id, t.ownerId),
    fk([t.namespace, t.ownerId], [users.namespace, users.id], 'app_conversation_actor_fk'),
    check('app_conversation_revision', sql`${t.revision}>=0`),
    index('app_conversation_list').on(t.namespace, t.ownerId, t.createdAt, t.id),
  ],
);
export const applicationSavedViews = pgTable(
  'application_saved_views',
  {
    ...identity(),
    name: text().notNull(),
    revision: integer().notNull(),
    definition: jsonb().notNull(),
    ...times(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.id] }),
    unique('app_view_owner').on(t.namespace, t.id, t.ownerId),
    fk([t.namespace, t.ownerId], [users.namespace, users.id], 'app_view_actor_fk'),
    check('app_view_revision', sql`${t.revision}>0`),
    index('app_view_list').on(t.namespace, t.ownerId, t.createdAt, t.id),
  ],
);
export const applicationViewRevisions = pgTable(
  'application_view_revisions',
  {
    namespace: text().notNull(),
    viewId: text('view_id').notNull(),
    revision: integer().notNull(),
    ownerId: text('owner_id').notNull(),
    definition: jsonb().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.viewId, t.revision] }),
    unique('app_view_revision_owner').on(t.namespace, t.viewId, t.revision, t.ownerId),
    fk(
      [t.namespace, t.viewId, t.ownerId],
      [applicationSavedViews.namespace, applicationSavedViews.id, applicationSavedViews.ownerId],
      'app_view_revision_fk',
    ),
    check('app_view_history_revision', sql`${t.revision}>0`),
  ],
);
export const applicationRuns = pgTable(
  'application_runs',
  {
    ...identity(),
    conversationId: text('conversation_id'),
    viewId: text('view_id'),
    viewRevision: integer('view_revision'),
    requestId: text('request_id').notNull(),
    inputHash: text('input_hash').notNull(),
    kind: text().notNull(),
    status: text().notNull(),
    input: jsonb().notNull(),
    asOf: timestamp('as_of', { withTimezone: true }).notNull(),
    errorCode: text('error_code'),
    cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...times(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.id] }),
    unique('app_run_owner').on(t.namespace, t.id, t.ownerId),
    unique('app_run_conversation_identity').on(t.namespace, t.id, t.ownerId, t.conversationId),
    unique('app_run_request').on(t.namespace, t.ownerId, t.requestId),
    fk([t.namespace, t.ownerId], [users.namespace, users.id], 'app_run_actor_fk'),
    fk(
      [t.namespace, t.conversationId, t.ownerId],
      [
        applicationConversations.namespace,
        applicationConversations.id,
        applicationConversations.ownerId,
      ],
      'app_run_conversation_fk',
    ),
    fk(
      [t.namespace, t.viewId, t.viewRevision, t.ownerId],
      [
        applicationViewRevisions.namespace,
        applicationViewRevisions.viewId,
        applicationViewRevisions.revision,
        applicationViewRevisions.ownerId,
      ],
      'app_run_view_revision_fk',
    ),
    uniqueIndex('app_one_running_turn')
      .on(t.namespace, t.conversationId)
      .where(sql`${t.status}='running' AND ${t.conversationId} IS NOT NULL`),
    check(
      'app_run_status',
      sql`${t.status} IN ('running','completed','failed','cancelled','interrupted')`,
    ),
    check('app_run_kind', sql`${t.kind} IN ('chat','read','saved-view')`),
    check(
      'app_run_chat_scope',
      sql`(${t.kind}='chat' AND ${t.conversationId} IS NOT NULL) OR (${t.kind}<>'chat' AND ${t.conversationId} IS NULL)`,
    ),
    check(
      'app_run_saved_scope',
      sql`(${t.kind}='saved-view' AND ${t.viewId} IS NOT NULL) OR (${t.kind}<>'saved-view' AND ${t.viewId} IS NULL)`,
    ),
    check(
      'app_run_view_pair',
      sql`(${t.viewId} IS NULL AND ${t.viewRevision} IS NULL) OR (${t.viewId} IS NOT NULL AND ${t.viewRevision} IS NOT NULL AND ${t.viewRevision}>0)`,
    ),
  ],
);
export const applicationMessages = pgTable(
  'application_messages',
  {
    ...identity(),
    conversationId: text('conversation_id').notNull(),
    runId: text('run_id').notNull(),
    sequence: integer().notNull(),
    role: text().notNull(),
    message: jsonb().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.id] }),
    unique('app_message_order').on(t.namespace, t.conversationId, t.sequence),
    fk(
      [t.namespace, t.conversationId, t.ownerId],
      [
        applicationConversations.namespace,
        applicationConversations.id,
        applicationConversations.ownerId,
      ],
      'app_message_conversation_fk',
    ),
    fk(
      [t.namespace, t.runId, t.ownerId, t.conversationId],
      [
        applicationRuns.namespace,
        applicationRuns.id,
        applicationRuns.ownerId,
        applicationRuns.conversationId,
      ],
      'app_message_run_fk',
    ),
    check('app_message_role', sql`${t.role} IN ('user','assistant')`),
    check('app_message_sequence', sql`${t.sequence}>=0`),
  ],
);
export const applicationResults = pgTable(
  'application_results',
  {
    ...identity(),
    runId: text('run_id').notNull(),
    payload: jsonb().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.namespace, t.id] }),
    unique('app_result_run').on(t.namespace, t.runId),
    index('app_result_list').on(t.namespace, t.ownerId, t.createdAt, t.id),
    fk(
      [t.namespace, t.runId, t.ownerId],
      [applicationRuns.namespace, applicationRuns.id, applicationRuns.ownerId],
      'app_result_run_fk',
    ),
  ],
);
