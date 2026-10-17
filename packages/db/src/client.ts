import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export function createDatabase(
  connectionString: string,
  options: { maxConnections?: number } = {},
) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('DATABASE_URL must be a PostgreSQL URL.');
  const pool = new pg.Pool({
    connectionString,
    max: options.maxConnections ?? 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 60_000,
  });
  // An idle pool error must not terminate the API or expose credentials through logging.
  pool.on('error', (error: Error & { code?: string }) =>
    console.error('Database idle connection error', error.code ?? 'UNKNOWN'),
  );
  return { db: drizzle(pool, { schema }), pool, close: () => pool.end() };
}
export type DatabaseConnection = ReturnType<typeof createDatabase>;
export function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is required. See the storage setup guide.');
  return value;
}
