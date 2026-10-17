import 'dotenv/config';
import { closeDatabase, getDatabase } from './database.js';

try {
  const { pool } = getDatabase();
  const result = await pool.query('SELECT count(*)::int AS assets FROM assets');
  console.log(JSON.stringify({ status: 'ok', ...result.rows[0] }));
} catch {
  console.error('API database check failed. Configure DATABASE_URL and apply migrations.');
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
