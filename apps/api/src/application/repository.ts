import { createHash, randomUUID } from 'node:crypto';
import {
  type ApplicationResult,
  applicationResultSchema,
  type SavedViewDefinition,
} from '@repo/contracts';
import type { DatabaseConnection } from '@repo/db';
import {
  applicationConversations as conversations,
  applicationMessages as messages,
  applicationResults as results,
  applicationViewRevisions as revisions,
  applicationRuns as runs,
  applicationSavedViews as views,
} from '@repo/db/schema';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { decodeCursor, encodeCursor } from './pagination.js';

export class ApplicationError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 503,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export type Actor = { namespace: string; ownerId: string };
type Owned = { namespace: AnyPgColumn; ownerId: AnyPgColumn; id: AnyPgColumn };
const owned = (table: Owned, actor: Actor, id?: string) =>
  and(
    eq(table.namespace, actor.namespace),
    eq(table.ownerId, actor.ownerId),
    ...(id === undefined ? [] : [eq(table.id, id)]),
  );
export const hashInput = (input: unknown) =>
  createHash('sha256').update(JSON.stringify(input)).digest('hex');
const missing = () => new ApplicationError(404, 'NOT_FOUND', 'Resource not found.');
export type RunRow = typeof runs.$inferSelect;
export function createApplicationRepository(connection: DatabaseConnection) {
  const db = connection.db;
  const run = async (actor: Actor, id: string) => {
    const [row] = await db
      .select()
      .from(runs)
      .where(owned(runs, actor, id));
    if (!row) throw missing();
    return row;
  };
  const result = async (actor: Actor, id: string) => {
    const [row] = await db
      .select()
      .from(results)
      .where(owned(results, actor, id));
    if (!row) throw missing();
    return applicationResultSchema.parse(row.payload);
  };
  const forRun = async (actor: Actor, id: string) => {
    const [row] = await db
      .select()
      .from(results)
      .where(and(owned(results, actor), eq(results.runId, id)));
    return row ? applicationResultSchema.parse(row.payload) : null;
  };
  return {
    run,
    result,
    forRun,
    async interruptRunning(namespace: string) {
      // One application process per configured namespace. No automatic regeneration.
      await db
        .update(runs)
        .set({
          status: 'interrupted',
          errorCode: 'PROCESS_INTERRUPTED',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(runs.namespace, namespace), eq(runs.status, 'running')));
    },
    async createConversation(actor: Actor, title: string) {
      const [row] = await db
        .insert(conversations)
        .values({ ...actor, id: randomUUID(), title })
        .returning();
      return row;
    },
    async listConversations(actor: Actor, after: string | undefined, limit: number) {
      const cursor = decodeCursor(after);
      const rows = await db
        .select({
          id: conversations.id,
          title: conversations.title,
          revision: conversations.revision,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
          cursorTime: sql<string>`to_char(${conversations.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        })
        .from(conversations)
        .where(
          and(
            owned(conversations, actor),
            cursor
              ? sql`(${conversations.createdAt},${conversations.id}) < (${cursor.at}::timestamptz,${cursor.id})`
              : undefined,
          ),
        )
        .orderBy(desc(conversations.createdAt), desc(conversations.id))
        .limit(limit + 1);
      return {
        items: rows.slice(0, limit).map(({ cursorTime: _, ...row }) => row),
        nextCursor: rows.length > limit ? encodeCursor(rows[limit - 1]) : null,
      };
    },
    async conversation(
      actor: Actor,
      id: string,
      before: number | undefined,
      limit: number,
      includeResults = false,
    ) {
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(owned(conversations, actor, id));
      if (!conversation) throw missing();
      const rows = await db
        .select({
          sequence: messages.sequence,
          message: includeResults
            ? messages.message
            : sql`jsonb_build_object('id', ${messages.message}->'id', 'role', ${messages.message}->'role', 'metadata', ${messages.message}->'metadata', 'parts', coalesce((SELECT jsonb_agg(part) FROM jsonb_array_elements(${messages.message}->'parts') part WHERE part->>'type'='text'), '[]'::jsonb))`,
        })
        .from(messages)
        .where(
          and(
            owned(messages, actor),
            eq(messages.conversationId, id),
            before === undefined ? undefined : lt(messages.sequence, before),
          ),
        )
        .orderBy(desc(messages.sequence))
        .limit(limit + 1);
      const selected = rows.slice(0, limit).reverse();
      return {
        ...conversation,
        messages: selected.map((row) => row.message),
        nextCursor: rows.length > limit ? (selected[0]?.sequence ?? null) : null,
      };
    },
    async history(actor: Actor, conversationId: string) {
      const rows = await db
        .select({
          role: messages.role,
          content: sql<string>`coalesce((SELECT string_agg(part->>'text', chr(10) ORDER BY ordinal) FROM jsonb_array_elements(${messages.message}->'parts') WITH ORDINALITY AS parts(part,ordinal) WHERE part->>'type'='text'), '')`,
        })
        .from(messages)
        .where(and(owned(messages, actor), eq(messages.conversationId, conversationId)))
        .orderBy(desc(messages.sequence))
        .limit(20);
      const history: { role: 'user' | 'assistant'; content: string }[] = [];
      let length = 0;
      for (const row of rows) {
        const content = row.content;
        if (length + content.length > 24000) break;
        if (content && (row.role === 'user' || row.role === 'assistant')) {
          history.unshift({ role: row.role, content });
          length += content.length;
        }
      }
      return history;
    },
    async admit(
      actor: Actor,
      input: {
        requestId: string;
        kind: 'chat' | 'read' | 'saved-view';
        payload: unknown;
        asOf: string;
        conversationId?: string;
        viewId?: string;
        viewRevision?: number;
        userText?: string;
      },
    ) {
      const inputHash = hashInput({
        kind: input.kind,
        conversationId: input.conversationId,
        viewId: input.viewId,
        viewRevision: input.viewRevision,
        payload: input.payload,
      });
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.namespace}:${actor.ownerId}:${input.requestId}`},0))`,
        );
        const [existing] = await tx
          .select()
          .from(runs)
          .where(and(owned(runs, actor), eq(runs.requestId, input.requestId)));
        if (existing) {
          if (existing.inputHash !== inputHash)
            throw new ApplicationError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'Request ID was already used with different input.',
            );
          return { run: existing, replay: true, assistantSequence: null };
        }
        let assistantSequence: number | null = null;
        if (input.conversationId) {
          const [conversation] = await tx
            .select()
            .from(conversations)
            .where(owned(conversations, actor, input.conversationId))
            .for('update');
          if (!conversation) throw missing();
          const [active] = await tx
            .select({ id: runs.id })
            .from(runs)
            .where(
              and(
                eq(runs.namespace, actor.namespace),
                eq(runs.conversationId, conversation.id),
                eq(runs.status, 'running'),
              ),
            )
            .limit(1);
          if (active)
            throw new ApplicationError(
              409,
              'CONVERSATION_BUSY',
              'A turn is already running in this conversation.',
            );
          assistantSequence = conversation.revision * 2 + 1;
          await tx
            .update(conversations)
            .set({ revision: conversation.revision + 1, updatedAt: new Date() })
            .where(owned(conversations, actor, conversation.id));
        }
        const [created] = await tx
          .insert(runs)
          .values({
            ...actor,
            id: randomUUID(),
            conversationId: input.conversationId ?? null,
            viewId: input.viewId ?? null,
            viewRevision: input.viewRevision ?? null,
            requestId: input.requestId,
            inputHash,
            kind: input.kind,
            status: 'running',
            input: input.payload,
            asOf: new Date(input.asOf),
          })
          .returning();
        if (!created) throw new Error('Run admission failed.');
        if (input.conversationId && input.userText !== undefined && assistantSequence !== null) {
          const id = randomUUID();
          await tx.insert(messages).values({
            ...actor,
            id,
            conversationId: input.conversationId,
            runId: created.id,
            sequence: assistantSequence - 1,
            role: 'user',
            message: { id, role: 'user', parts: [{ type: 'text', text: input.userText }] },
          });
        }
        return { run: created, replay: false, assistantSequence };
      });
    },
    async complete(
      actor: Actor,
      runId: string,
      payload: ApplicationResult,
      assistantSequence: number | null,
    ) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(runs)
          .where(owned(runs, actor, runId))
          .for('update');
        if (!current) throw missing();
        if (current.status !== 'running' || current.cancelRequestedAt) return false;
        const accepted = applicationResultSchema.parse(payload);
        if (
          accepted.runId !== runId ||
          (accepted.conversationId ?? null) !== current.conversationId ||
          accepted.kind !== current.kind
        )
          throw new Error('Result does not match its admitted run.');
        await tx.insert(results).values({ ...actor, id: accepted.id, runId, payload: accepted });
        if (current.conversationId && assistantSequence !== null) {
          const id = `assistant-${runId}`;
          await tx.insert(messages).values({
            ...actor,
            id,
            conversationId: current.conversationId,
            runId,
            sequence: assistantSequence,
            role: 'assistant',
            message: {
              id,
              role: 'assistant',
              metadata: { runId, resultId: accepted.id },
              parts: [
                { type: 'text', text: accepted.text },
                {
                  type: 'data-visual',
                  id: accepted.id,
                  data: { kind: 'application-result', schemaVersion: 1, result: accepted },
                },
                {
                  type: 'data-citations',
                  id: `${accepted.id}:citations`,
                  data: { runId, resultId: accepted.id, evidence: accepted.evidence },
                },
              ],
            },
          });
        }
        await tx
          .update(runs)
          .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
          .where(owned(runs, actor, runId));
        return true;
      });
    },
    async finish(actor: Actor, runId: string, status: 'failed' | 'cancelled', errorCode: string) {
      const rows = await db
        .update(runs)
        .set({
          status,
          errorCode,
          updatedAt: new Date(),
          completedAt: new Date(),
          ...(status === 'cancelled' ? { cancelRequestedAt: new Date() } : {}),
        })
        .where(and(owned(runs, actor, runId), eq(runs.status, 'running')))
        .returning();
      return rows[0] ?? run(actor, runId);
    },
    async listReferences(actor: Actor, after: string | undefined, limit: number) {
      const cursor = decodeCursor(after);
      const rows = await db
        .select({
          id: results.id,
          runId: results.runId,
          conversationId: sql<string | null>`${results.payload}->>'conversationId'`,
          asOf: sql<string>`${results.payload}->>'asOf'`,
          entityRefs: sql<ApplicationResult['entityRefs']>`${results.payload}->'entityRefs'`,
          cursorTime: sql<string>`to_char(${results.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        })
        .from(results)
        .where(
          and(
            owned(results, actor),
            cursor
              ? sql`(${results.createdAt},${results.id}) < (${cursor.at}::timestamptz,${cursor.id})`
              : undefined,
          ),
        )
        .orderBy(desc(results.createdAt), desc(results.id))
        .limit(limit + 1);
      return {
        items: rows
          .slice(0, limit)
          .map(({ id, cursorTime: _, ...row }) => ({ resultId: id, ...row })),
        nextCursor: rows.length > limit ? encodeCursor(rows[limit - 1]) : null,
      };
    },
    async createView(actor: Actor, definition: SavedViewDefinition) {
      return db.transaction(async (tx) => {
        const [view] = await tx
          .insert(views)
          .values({ ...actor, id: randomUUID(), name: definition.name, definition, revision: 1 })
          .returning();
        if (!view) throw new Error('View creation failed.');
        await tx.insert(revisions).values({
          namespace: actor.namespace,
          ownerId: actor.ownerId,
          viewId: view.id,
          revision: 1,
          definition,
        });
        return view;
      });
    },
    async view(actor: Actor, id: string) {
      const [view] = await db
        .select()
        .from(views)
        .where(owned(views, actor, id));
      if (!view) throw missing();
      return view;
    },
    async listViews(actor: Actor, after: string | undefined, limit: number) {
      const cursor = decodeCursor(after);
      const rows = await db
        .select({
          id: views.id,
          name: views.name,
          revision: views.revision,
          createdAt: views.createdAt,
          updatedAt: views.updatedAt,
          cursorTime: sql<string>`to_char(${views.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        })
        .from(views)
        .where(
          and(
            owned(views, actor),
            cursor
              ? sql`(${views.createdAt},${views.id}) < (${cursor.at}::timestamptz,${cursor.id})`
              : undefined,
          ),
        )
        .orderBy(desc(views.createdAt), desc(views.id))
        .limit(limit + 1);
      return {
        items: rows.slice(0, limit).map(({ cursorTime: _, ...row }) => row),
        nextCursor: rows.length > limit ? encodeCursor(rows[limit - 1]) : null,
      };
    },
    async updateView(
      actor: Actor,
      id: string,
      expectedRevision: number,
      definition: SavedViewDefinition,
    ) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(views)
          .where(owned(views, actor, id))
          .for('update');
        if (!current) throw missing();
        if (current.revision !== expectedRevision)
          throw new ApplicationError(
            409,
            'REVISION_CONFLICT',
            'Saved view changed; reload before editing.',
          );
        const [updated] = await tx
          .update(views)
          .set({
            name: definition.name,
            definition,
            revision: current.revision + 1,
            updatedAt: new Date(),
          })
          .where(owned(views, actor, id))
          .returning();
        await tx.insert(revisions).values({
          namespace: actor.namespace,
          ownerId: actor.ownerId,
          viewId: id,
          revision: current.revision + 1,
          definition,
        });
        return updated;
      });
    },
  };
}
