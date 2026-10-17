import 'dotenv/config';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadDirectory } from './load.js';

try {
  const { values } = parseArgs({
    options: { 'data-root': { type: 'string' }, namespace: { type: 'string' } },
  });
  if (!values['data-root'] || !values.namespace?.trim())
    throw new Error('Usage: pnpm ingest --data-root /absolute/path/to/data --namespace challenge');
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required in apps/ingestion/.env.');
  console.log(
    JSON.stringify(
      await loadDirectory(
        resolve(process.env.INIT_CWD ?? process.cwd(), values['data-root']),
        values.namespace,
        process.env.DATABASE_URL,
      ),
    ),
  );
} catch (error) {
  // CLI diagnostics must never print connection URLs or raw database error internals.
  const message =
    error instanceof Error && !('query' in error) && !('code' in error)
      ? error.message
      : 'Import failed; check schema constraints and input references.';
  console.error(message);
  process.exitCode = 1;
}
