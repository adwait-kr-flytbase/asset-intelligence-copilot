import 'dotenv/config';
import { createDatabase, requireDatabaseUrl } from '../src/client.js';

const connection = createDatabase(requireDatabaseUrl());
try {
  const result = await connection.pool.query(
    'SELECT current_database() AS database, version() AS version',
  );
  const extension = await connection.pool.query(
    "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
  );
  if (!extension.rows[0]) throw new Error('pgvector migration is required.');
  console.log(
    JSON.stringify({ status: 'ok', ...result.rows[0], pgvector: extension.rows[0].extversion }),
  );
} catch {
  console.error(
    'Database check failed. Check DATABASE_URL/server readiness and apply migrations on a pgvector-capable server.',
  );
  process.exitCode = 1;
} finally {
  await connection.close();
}
