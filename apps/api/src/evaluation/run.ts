import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  type ExecutionEvent,
  type ModelObservation,
  runCoordinator,
} from '../agents/coordinator.js';
import { createOpenRouterModel } from '../agents/openrouter.js';
import { createAnalyticsService } from '../evidence/analytics.js';
import { createPostgresAnalytics } from '../evidence/analytics-postgres.js';
import { createPostgresEvidence } from '../evidence/postgres.js';
import { createEvidenceService } from '../evidence/service.js';
import { closeDatabase, getDatabase } from '../storage/database.js';
import { controlledCases, sampleCases } from './cases.js';
import { capabilityCatalogue, statefulSequences } from './catalogue.js';
import { fixtureEvidence } from './fixtures.js';
import { judgeResponse } from './judge.js';
import { scoreTrial } from './metrics.js';

const flags: Record<string, string | boolean> = {};
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([a-z-]+)(?:=(.*))?$/);
  if (!match?.[1])
    throw new Error('Use --name=value flags; credentials belong only in app-local env.');
  if (match[1] in flags) throw new Error('Duplicate flag.');
  flags[match[1]] = match[2] ?? true;
}
const options = z
  .object({
    live: z.literal(true).optional(),
    data: z.enum(['controlled', 'sample']).default('controlled'),
    trials: z.coerce.number().int().min(1).max(10).default(1),
    model: z.string().min(1).optional(),
    'judge-model': z.string().min(1).optional(),
    case: z.string().min(1).optional(),
    'timeout-ms': z.coerce.number().int().min(1000).max(180000).default(60000),
  })
  .strict()
  .parse(flags);
const cases = (options.data === 'sample' ? sampleCases : controlledCases).filter(
  (item) => !options.case || options.case.split(',').includes(item.id),
);
if (!cases.length || options.case?.split(',').some((id) => !cases.some((item) => item.id === id)))
  throw new Error('Unknown evaluation case for the selected dataset.');

if (!options.live) {
  console.log(
    JSON.stringify(
      {
        mode: 'preview',
        providerCalls: 0,
        data: options.data,
        trials: options.trials,
        cases,
        capabilityCatalogue,
        statefulSequences,
        metrics: [
          'tool goal coverage',
          'argument scope',
          'required-source recall',
          'citation validity',
          'tool failures and repeated calls',
          'latency and tool timings',
          'reported token usage',
          'response rubric (optional model judge or manual review)',
        ],
        live: 'Add --live and --model=provider/model to execute. --judge-model=provider/model enables separate paid answer grading.',
      },
      null,
      2,
    ),
  );
} else {
  await import('dotenv/config');
  const modelId = options.model ?? process.env.OPENROUTER_MODEL;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!modelId || !apiKey)
    throw new Error('Set OPENROUTER_API_KEY and specify --model or OPENROUTER_MODEL.');
  const model = createOpenRouterModel({ apiKey, modelId });
  const judge = options['judge-model']
    ? createOpenRouterModel({ apiKey, modelId: options['judge-model'] })
    : null;
  const output = fileURLToPath(
    new URL(
      `../../../../.context/backend-evidence-slice/eval-runs/${Date.now()}-${randomUUID()}/`,
      import.meta.url,
    ),
  );
  await mkdir(output, { recursive: true });
  const reports: Record<string, unknown>[] = [];
  const asOf = '2026-10-17T00:00:00.000Z';
  const codeHash = createHash('sha256');
  for (const path of [
    '../agents/coordinator.ts',
    '../agents/agent.ts',
    '../agents/openrouter.ts',
    '../evidence/service.ts',
    '../evidence/rules.ts',
    '../evidence/analytics.ts',
    '../evidence/analytics-postgres.ts',
    '../evidence/postgres.ts',
    './cases.ts',
    './metrics.ts',
    './judge.ts',
  ])
    codeHash.update(await readFile(new URL(path, import.meta.url)));
  const codeFingerprint = codeHash.digest('hex');
  try {
    let datasetFingerprint: string;
    if (options.data === 'sample') {
      if (!process.env.AGENT_NAMESPACE)
        throw new Error('Sample evaluations require explicit AGENT_NAMESPACE.');
      const sources = await getDatabase().pool.query(
        'SELECT id,content_hash FROM source_files WHERE namespace=$1 ORDER BY id',
        [process.env.AGENT_NAMESPACE],
      );
      if (!sources.rows.length) throw new Error('Sample namespace is empty.');
      datasetFingerprint = createHash('sha256').update(JSON.stringify(sources.rows)).digest('hex');
    } else {
      datasetFingerprint = createHash('sha256')
        .update(await readFile(new URL('./fixtures.ts', import.meta.url)))
        .digest('hex');
    }
    console.log(
      `Running ${cases.length * options.trials} candidate trials${judge ? ' with additional model judging' : '; answer quality requires manual review'}.`,
    );
    for (const test of cases)
      for (let attempt = 1; attempt <= options.trials; attempt++) {
        // Every controlled trial gets fresh evidence; sample adapter is SELECT-only.
        const reader =
          options.data === 'sample'
            ? createPostgresEvidence(getDatabase().pool, process.env.AGENT_NAMESPACE ?? '')
            : fixtureEvidence(test.fixtureProfile).reader;
        const trace: ExecutionEvent[] = [];
        let observation: ModelObservation | null = null;
        const started = performance.now();
        let accepted = false;
        let error: string | null = null;
        const pending = new Map<string, number>();
        const toolTimings: { toolCallId: string; durationMs: number; status: string }[] = [];
        let firstToolResultMs: number | null = null;
        try {
          await runCoordinator([{ role: 'user', content: test.question }], {
            model,
            evidence: createEvidenceService(reader, asOf),
            analytics:
              options.data === 'sample'
                ? createAnalyticsService(
                    createPostgresAnalytics(
                      getDatabase().pool,
                      process.env.AGENT_NAMESPACE ?? '',
                      asOf,
                    ),
                    asOf,
                  )
                : undefined,
            signal: AbortSignal.timeout(options['timeout-ms']),
            onEvent(event) {
              trace.push(event);
              if (event.type === 'tool-start') pending.set(event.toolCallId, performance.now());
              else {
                const start = pending.get(event.toolCallId);
                if (start !== undefined)
                  toolTimings.push({
                    toolCallId: event.toolCallId,
                    durationMs: performance.now() - start,
                    status: event.type,
                  });
                if (event.type === 'tool-result' && firstToolResultMs === null)
                  firstToolResultMs = performance.now() - started;
              }
            },
            onModelResult(result) {
              observation = result;
            },
          });
          accepted = true;
        } catch (failure) {
          error =
            failure instanceof Error
              ? /^(Answer|Investigation|Evidence operation|Model request)/.test(failure.message)
                ? failure.message
                : failure.name
              : 'UnknownError';
        }
        const trial = { observation, trace, latencyMs: performance.now() - started, accepted };
        const metrics = scoreTrial(test, trial);
        let responseReview: unknown = metrics.responseReview;
        if (judge && observation) {
          try {
            responseReview = await judgeResponse(
              judge,
              test,
              trial,
              AbortSignal.timeout(options['timeout-ms']),
            );
          } catch {
            responseReview = { status: 'judge-failed', criteria: test.responseCriteria };
          }
        }
        const record = {
          caseId: test.id,
          attempt,
          question: test.question,
          modelId,
          judgeModelId: options['judge-model'] ?? null,
          dataset: options.data,
          datasetFingerprint,
          codeFingerprint,
          asOf,
          accepted,
          error,
          metrics: { ...metrics, firstToolResultMs, toolTimings, responseReview },
          observation,
          trace,
        };
        reports.push(record);
        await writeFile(`${output}/${test.id}-${attempt}.json`, JSON.stringify(record, null, 2));
        console.log(
          `${test.id} trial ${attempt}: execution/evidence ${metrics.executionEvidencePassed ? 'PASS' : 'FAIL'}; ${Math.round(trial.latencyMs)}ms`,
        );
      }
    const review = (row: Record<string, unknown>) =>
      (row.metrics as { responseReview: { status: string; passed?: boolean } }).responseReview;
    const averages = Object.fromEntries(
      [
        'latencyMs',
        'firstToolResultMs',
        'toolGoalCoverage',
        'requiredSourceRecall',
        'citationValidity',
        'toolFailureRate',
      ].map((key) => {
        const values = reports
          .map((row) => (row.metrics as Record<string, unknown>)[key])
          .filter((value): value is number => typeof value === 'number');
        return [
          key,
          {
            mean: values.length
              ? values.reduce((sum, value) => sum + value, 0) / values.length
              : null,
            observations: values.length,
          },
        ];
      }),
    );
    const summary = {
      modelId,
      judgeModelId: options['judge-model'] ?? null,
      dataset: options.data,
      datasetFingerprint,
      codeFingerprint,
      trials: reports.length,
      averages,
      responseQuality: {
        judged: reports.filter((row) => review(row).status === 'model-judged').length,
        passed: reports.filter((row) => review(row).passed === true).length,
        pending: reports.filter((row) => review(row).status === 'pending').length,
        judgeFailed: reports.filter((row) => review(row).status === 'judge-failed').length,
      },
      cases: cases.map((test) => ({
        id: test.id,
        attempts: reports.filter((row) => row.caseId === test.id).length,
        executionEvidencePassed: reports.filter(
          (row) =>
            row.caseId === test.id &&
            (row.metrics as ReturnType<typeof scoreTrial>).executionEvidencePassed,
        ).length,
      })),
      limits: [
        'Execution/evidence success is not answer correctness.',
        'Judge scores require human calibration.',
        'Every trial retained; no best-of selection.',
        'Missing token usage/cost is unknown.',
        'Small samples do not establish production reliability.',
      ],
    };
    await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
    console.log(`Reports: ${output}`);
  } finally {
    await closeDatabase();
  }
}
