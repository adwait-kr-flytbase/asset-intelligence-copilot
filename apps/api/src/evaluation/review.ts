import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import type { ExecutionEvent, ModelObservation } from '../agents/coordinator.js';
import { controlledCases, sampleCases } from './cases.js';
import { scoreTrial } from './metrics.js';

export const reviewSchema = z.object({
  reportSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewer: z.string().trim().min(1),
  criteria: z.array(
    z.object({
      id: z.string(),
      verdict: z.enum(['pass', 'fail', 'uncertain']),
      answerQuote: z.string(),
      reason: z.string().trim().min(1),
    }),
  ),
  unsupportedClaims: z.array(z.string().trim().min(1)),
});

/** A review is an explicit evaluator judgment, bound to one immutable trial. No model calls. */
export function validateReview(
  report: {
    caseId: string;
    accepted: boolean;
    observation: ModelObservation | null;
    trace: ExecutionEvent[];
    metrics: { latencyMs: number };
    artifactFidelity?: { status: string };
  },
  reportText: string,
  input: unknown,
) {
  const review = reviewSchema.parse(input);
  if (createHash('sha256').update(reportText).digest('hex') !== review.reportSha256)
    throw new Error('Review does not match this recorded trial.');
  const test = [...controlledCases, ...sampleCases].find((item) => item.id === report.caseId);
  if (!test) throw new Error('Unknown evaluation case.');
  const expected = new Set(test.responseCriteria.map((criterion) => criterion.id));
  if (
    review.criteria.length !== expected.size ||
    new Set(review.criteria.map((item) => item.id)).size !== expected.size ||
    review.criteria.some((item) => !expected.has(item.id))
  )
    throw new Error('Review must grade every criterion exactly once.');
  for (const item of review.criteria) {
    if (
      (item.verdict === 'pass' && !item.answerQuote.trim()) ||
      (item.answerQuote && !report.observation?.text.includes(item.answerQuote))
    )
      throw new Error('Review quotes must be exact excerpts of the actual final answer.');
  }
  const metrics = scoreTrial(test, { ...report, latencyMs: report.metrics.latencyMs });
  const responsePassed =
    metrics.finalOutputChecksPassed &&
    review.criteria.every((item) => item.verdict === 'pass') &&
    !review.unsupportedClaims.length;
  return {
    status: 'evaluator-reviewed' as const,
    ...review,
    reviewedAt: new Date().toISOString(),
    responsePassed,
    overallPassed:
      metrics.executionEvidencePassed &&
      responsePassed &&
      report.artifactFidelity?.status !== 'failed',
    metrics,
    limitation: 'Recorded evaluator judgment, not independent proof or a reliability estimate.',
  };
}

// Importable for grader checks; direct CLI execution writes an exclusive sidecar, never the trial.
if (process.argv[1]?.endsWith('/evaluation/review.ts')) {
  const [reportPath, reviewPath] = process.argv.slice(2);
  if (!reportPath || !reviewPath) throw new Error('Pass a trial JSON and evaluator review JSON.');
  const reportText = await readFile(reportPath, 'utf8');
  const result = validateReview(
    JSON.parse(reportText),
    reportText,
    JSON.parse(await readFile(reviewPath, 'utf8')),
  );
  const output = `${reviewPath}.validated.json`;
  await writeFile(output, JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(
    JSON.stringify({
      output,
      responsePassed: result.responsePassed,
      overallPassed: result.overallPassed,
      providerCalls: 0,
    }),
  );
}
