import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase, requireDatabaseUrl } from '../src/client.js';

const connection = createDatabase(requireDatabaseUrl());
try {
  await migrate(connection.db, {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
  console.log('Database migrations applied.');
} catch (error) {
  console.error(
    'Migration failed:',
    (error as { code?: string }).code ?? 'check migration and database configuration',
  );
  process.exitCode = 1;
} finally {
  await connection.close();
}
