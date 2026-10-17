import 'dotenv/config';
import assert from 'node:assert/strict';
import { cosineDistance, sql } from 'drizzle-orm';
import { integer, pgTable, vector } from 'drizzle-orm/pg-core';
import { createDatabase, requireDatabaseUrl } from '../src/client.js';

const probe = pgTable('pgvector_smoke', {
  id: integer().primaryKey(),
  embedding: vector({ dimensions: 3 }).notNull(),
});
const connection = createDatabase(requireDatabaseUrl());
try {
  const extension = await connection.pool.query(
    "SELECT extversion FROM pg_extension WHERE extname='vector'",
  );
  assert(extension.rows[0], 'pgvector is not enabled. Run db:migrate on a vector-capable server.');
  await connection.db.transaction(async (tx) => {
    // Synthetic vectors only, connection-local table; commit drops all probe data.
    await tx.execute(
      sql`CREATE TEMP TABLE pgvector_smoke (id integer PRIMARY KEY, embedding vector(3) NOT NULL) ON COMMIT DROP`,
    );
    await tx.insert(probe).values([
      { id: 1, embedding: [1, 0, 0] },
      { id: 2, embedding: [0, 1, 0] },
      { id: 3, embedding: [0.9, 0.1, 0] },
    ]);
    const distance = cosineDistance(probe.embedding, [1, 0, 0]);
    const nearest = await tx
      .select({ id: probe.id, distance })
      .from(probe)
      .orderBy(distance)
      .limit(2);
    assert.deepEqual(
      nearest.map((row) => row.id),
      [1, 3],
    );
    assert.equal(Number(nearest[0]?.distance), 0);
    await assert.rejects(
      tx.transaction(async (nested) => {
        await nested.insert(probe).values({ id: 4, embedding: [1, 2] });
      }),
    );
  });
  console.log(
    JSON.stringify({
      status: 'ok',
      extension: 'vector',
      version: extension.rows[0].extversion,
      drizzleVectorRoundTrip: true,
      cosineSearch: true,
      invalidDimensionsRejected: true,
      persistentProbeData: false,
    }),
  );
} catch {
  console.error('pgvector check failed. Verify the server provides vector and db:migrate has run.');
  process.exitCode = 1;
} finally {
  await connection.close();
}
