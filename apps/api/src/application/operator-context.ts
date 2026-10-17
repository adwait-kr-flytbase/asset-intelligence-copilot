import type { DatabaseConnection } from '@repo/db';
import type { OperatorContextPort, OperatorMemory } from '../agents/operator-context.js';
import type { ApplicationData } from './data.js';
import type { ExecutionContext } from './ports.js';

/** Explicit memory annotations only; private conversation text is never cross-person retrieval. */
export function createOperatorContext(
  connection: DatabaseConnection,
  data: ApplicationData,
  context: ExecutionContext,
  runId: string,
  latestUserText: string,
): OperatorContextPort {
  const persona = () => data.persona(context.namespace, context.ownerId);
  return {
    async read() {
      const person = await persona();
      if (!person) throw new Error('Operator identity is unavailable.');
      const result = await connection.pool.query<{ memory: OperatorMemory }>(
        `SELECT message->'metadata'->'operatorMemory' memory FROM application_messages
         WHERE namespace=$1 AND role='user' AND message->'metadata'->'operatorMemory' IS NOT NULL
         AND (owner_id=$2 OR message->'metadata'->'operatorMemory'->>'visibility'='shared')
         ORDER BY created_at DESC LIMIT 100`,
        [context.namespace, context.ownerId],
      );
      return { persona: person, memories: result.rows.map((row) => row.memory) };
    },
    async remember(input) {
      const person = await persona();
      if (!person) throw new Error('Operator identity is unavailable.');
      if (
        input.kind === 'replacement-report' &&
        (!input.assetId ||
          !latestUserText.includes(input.assetId) ||
          !/replac|swapp|changed|pulled/i.test(latestUserText))
      )
        throw new Error('A replacement memory must refer to the operator’s actual current report.');
      if (
        input.kind === 'preference' &&
        !/for me|whenever|prefer|sort|show costs|remember/i.test(latestUserText)
      )
        throw new Error('No explicit personal preference was requested.');
      const memory: OperatorMemory = {
        id: `memory:${runId}`,
        kind: input.kind,
        visibility: input.kind === 'preference' ? 'private' : 'shared',
        ...(input.assetId ? { assetId: input.assetId } : {}),
        authorId: person.id,
        authorName: person.name,
        at: context.asOf,
        text: latestUserText,
        confidence: /told me|heard|apparently|someone said|they say/i.test(latestUserText)
          ? 'hearsay'
          : 'direct-report',
      };
      const result = await connection.pool.query(
        `UPDATE application_messages SET message=jsonb_set(message,'{metadata}',coalesce(message->'metadata','{}'::jsonb)||jsonb_build_object('operatorMemory',$4::jsonb)) WHERE namespace=$1 AND owner_id=$2 AND run_id=$3 AND role='user' RETURNING id`,
        [context.namespace, context.ownerId, runId, JSON.stringify(memory)],
      );
      if (result.rowCount !== 1)
        throw new Error('The current operator report could not be persisted.');
      return memory;
    },
  };
}
