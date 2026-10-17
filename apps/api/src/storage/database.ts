import { createDatabase, type DatabaseConnection, requireDatabaseUrl } from '@repo/db';

let connection: DatabaseConnection | undefined;
/** Lazily connect for application repositories; fixture startup needs no database. */
export function getDatabase(): DatabaseConnection {
  if (!connection) connection = createDatabase(requireDatabaseUrl());
  return connection;
}
export async function closeDatabase(): Promise<void> {
  const current = connection;
  connection = undefined;
  await current?.close();
}
