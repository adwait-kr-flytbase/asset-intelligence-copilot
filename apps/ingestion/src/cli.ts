import 'dotenv/config';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { embedDocuments } from './embed-documents.js';
import { loadDirectory } from './load.js';

let dataCommitted = false;
try {
  const { values } = parseArgs({
    options: {
      'data-root': { type: 'string' },
      namespace: { type: 'string' },
      embed: { type: 'boolean', default: false },
    },
  });
  if (!values['data-root'] || !values.namespace?.trim())
    throw new Error(
      'Usage: pnpm ingest --data-root /absolute/path/to/data --namespace challenge [--embed]',
    );
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required in apps/ingestion/.env.');
  if (values.embed && !process.env.OPENROUTER_API_KEY?.trim())
    throw new Error('--embed requires OPENROUTER_API_KEY in apps/ingestion/.env.');
  console.log(
    JSON.stringify(
      await loadDirectory(
        resolve(process.env.INIT_CWD ?? process.cwd(), values['data-root']),
        values.namespace,
        process.env.DATABASE_URL,
      ),
    ),
  );
  dataCommitted = true;
  if (values.embed) {
    console.log(
      JSON.stringify(
        await embedDocuments({
          databaseUrl: process.env.DATABASE_URL,
          namespace: values.namespace,
          apiKey: process.env.OPENROUTER_API_KEY,
          onProgress: (progress) =>
            console.error(JSON.stringify({ event: 'embedding-progress', ...progress })),
        }),
      ),
    );
  }
} catch (error) {
  // CLI diagnostics must never print connection URLs or raw database error internals.
  const message =
    error instanceof Error && !('query' in error) && !('code' in error)
      ? error.message
      : 'Import failed; check schema constraints and input references.';
  console.error(
    dataCommitted
      ? `Data import committed; embedding failed. Rerun embed:documents for this namespace. ${message}`
      : message,
  );
  process.exitCode = 1;
}
