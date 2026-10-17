import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { ExecutionEvent, ModelObservation } from '../agents/coordinator.js';
import { controlledCases, sampleCases } from './cases.js';
import { scoreTrial } from './metrics.js';

// Reuse recorded candidates when grading changes; no env, model or database calls.
const paths = process.argv.slice(2);
if (!paths.length)
  throw new Error('Pass one or more recorded trial JSON paths (not summary.json).');
const hash = createHash('sha256');
for (const path of ['./cases.ts', './metrics.ts'])
  hash.update(await readFile(new URL(path, import.meta.url)));
const graderFingerprint = hash.digest('hex');
for (const path of paths) {
  const recorded = JSON.parse(await readFile(path, 'utf8')) as {
    caseId: string;
    accepted: boolean;
    observation: ModelObservation | null;
    trace: ExecutionEvent[];
    metrics: { latencyMs: number };
    modelIds?: unknown;
    codeFingerprint: string;
  };
  const test = [...controlledCases, ...sampleCases].find((item) => item.id === recorded.caseId);
  if (!test || !Array.isArray(recorded.trace) || typeof recorded.accepted !== 'boolean')
    throw new Error('Not a recognized recorded evaluation trial.');
  console.log(
    JSON.stringify(
      {
        mode: 'rescore',
        providerCalls: 0,
        originalReport: path,
        originalCodeFingerprint: recorded.codeFingerprint,
        graderFingerprint,
        modelIds: recorded.modelIds,
        metrics: scoreTrial(test, { ...recorded, latencyMs: recorded.metrics.latencyMs }),
      },
      null,
      2,
    ),
  );
}
