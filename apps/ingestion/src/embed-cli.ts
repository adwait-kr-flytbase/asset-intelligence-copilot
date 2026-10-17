import 'dotenv/config';
import { parseArgs } from 'node:util';
import { embedDocuments } from './embed-documents.js';

try {
  const { values } = parseArgs({
    options: {
      namespace: { type: 'string' },
      limit: { type: 'string' },
      document: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (!values.namespace?.trim() || !process.env.DATABASE_URL)
    throw new Error(
      'Usage: pnpm embed:documents --namespace challenge [--limit 10] [--document path.md] [--dry-run]. DATABASE_URL is required.',
    );
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1))
    throw new Error('--limit must be a positive integer.');
  console.log(
    JSON.stringify(
      await embedDocuments({
        databaseUrl: process.env.DATABASE_URL,
        namespace: values.namespace,
        limit,
        documentId: values.document,
        dryRun: values['dry-run'],
        apiKey: process.env.OPENROUTER_API_KEY,
        onProgress: (progress) =>
          console.error(JSON.stringify({ event: 'embedding-progress', ...progress })),
      }),
      null,
      2,
    ),
  );
} catch (error) {
  const message =
    error instanceof Error && !('query' in error) && !('code' in error)
      ? error.message
      : 'Document indexing failed; check migrations and database constraints.';
  console.error(message);
  process.exitCode = 1;
}
