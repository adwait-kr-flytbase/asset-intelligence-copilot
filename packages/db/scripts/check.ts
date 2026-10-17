import 'dotenv/config';
import { createDatabase, requireDatabaseUrl } from '../src/client.js';

const connection = createDatabase(requireDatabaseUrl());
try {
  const result = await connection.pool.query(
    'SELECT current_database() AS database, version() AS version',
  );
  console.log(JSON.stringify({ status: 'ok', ...result.rows[0] }));
} catch {
  console.error('Database connection check failed. Check DATABASE_URL and PostgreSQL readiness.');
  process.exitCode = 1;
} finally {
  await connection.close();
}
