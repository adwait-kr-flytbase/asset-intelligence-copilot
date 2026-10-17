import 'dotenv/config';
import { runCoordinator } from '../agents/coordinator.js';
import { agentModelIdsFromEnv, createAgentModels } from '../agents/models.js';
import { createAnalyticsService } from '../evidence/analytics.js';
import { createPostgresAnalytics } from '../evidence/analytics-postgres.js';
import { createPostgresEvidence } from '../evidence/postgres.js';
import { createEvidenceService } from '../evidence/service.js';
import { closeDatabase, getDatabase } from '../storage/database.js';

const question = process.argv.slice(2).join(' ').trim();
if (!question) throw new Error('Pass the operator question as an argument.');
const namespace = process.env.AGENT_NAMESPACE;
if (!namespace) throw new Error('Set AGENT_NAMESPACE to your seeded namespace.');
const apiKey = process.env.OPENROUTER_API_KEY ?? '';
const models = createAgentModels(apiKey, agentModelIdsFromEnv(process.env), {
  provider: process.env.OPENROUTER_PROVIDER?.trim() || undefined,
});
const asOf = process.env.AGENT_AS_OF ?? new Date().toISOString();
try {
  const result = await runCoordinator([{ role: 'user', content: question }], {
    ...models,
    evidence: createEvidenceService(createPostgresEvidence(getDatabase().pool, namespace), asOf),
    analytics: createAnalyticsService(
      createPostgresAnalytics(getDatabase().pool, namespace, asOf),
      asOf,
    ),
    signal: AbortSignal.timeout(120000),
    onModelResult(observation) {
      if (process.env.AGENT_DEBUG === '1')
        console.error(
          JSON.stringify({
            candidate: observation.text,
            sourceIds: observation.sources.map((source) => source.id),
          }),
        );
    },
    onEvent(event) {
      if (event.type === 'tool-start')
        console.error(`→ ${event.toolName} ${JSON.stringify(event.input)}`);
    },
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await closeDatabase();
}
