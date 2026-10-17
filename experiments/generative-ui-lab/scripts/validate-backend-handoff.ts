import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { citationsSchema, operationalVisualSchema } from '../src/backend-handoff-contract.ts';

// Offline contract examples only. This script does not call an API or change records.
const fixture = JSON.parse(
  await readFile(new URL('../docs/backend-handoff-examples.json', import.meta.url), 'utf8'),
);
const bundle = z
  .object({
    schemaVersion: z.literal(1),
    synthetic: z.literal(true),
    visuals: z.array(operationalVisualSchema).length(8),
    citations: citationsSchema,
  })
  .strict()
  .parse(fixture);
assert.deepEqual(
  new Set(bundle.visuals.map((payload) => payload.artifact.kind)),
  new Set([
    'geo',
    'series',
    'ranking',
    'matrix',
    'obligations',
    'timeline',
    'claims',
    'correction',
  ]),
);
assert.ok(
  bundle.visuals.some(
    (payload) => payload.artifact.kind === 'ranking' && payload.artifact.id === 'repair-costs',
  ),
);

const geo = bundle.visuals.find((payload) => payload.artifact.kind === 'geo')!;
assert.equal(
  operationalVisualSchema.safeParse({
    ...geo,
    artifact: { ...geo.artifact, sourceIds: [...geo.artifact.sourceIds, 'unknown-source'] },
  }).success,
  false,
);
assert.equal(
  operationalVisualSchema.safeParse({ ...geo, evidence: [...geo.evidence, geo.evidence[0]] })
    .success,
  false,
);
assert.equal(
  operationalVisualSchema.safeParse({
    ...geo,
    evidence: [{ ...geo.evidence[0], inputSourceIds: ['unknown-input'] }, ...geo.evidence.slice(1)],
  }).success,
  false,
);
assert.equal(
  operationalVisualSchema.safeParse({
    ...geo,
    evidence: [{ ...geo.evidence[0], supersedes: ['unknown-revision'] }, ...geo.evidence.slice(1)],
  }).success,
  false,
);
assert.equal(operationalVisualSchema.safeParse({ ...geo, readOnly: false }).success, false);
assert.equal(operationalVisualSchema.safeParse({ ...geo, queryJS: 'execute()' }).success, false);
if (geo.artifact.kind !== 'geo') throw Error('Missing geographic example');
for (const coordinates of [{ lat: 91 }, { lat: 32, lon: null }]) {
  assert.equal(
    operationalVisualSchema.safeParse({
      ...geo,
      artifact: {
        ...geo.artifact,
        points: [{ ...geo.artifact.points[0], ...coordinates }, ...geo.artifact.points.slice(1)],
      },
    }).success,
    false,
  );
}
assert.equal(
  citationsSchema.safeParse({
    ...bundle.citations,
    claims: [{ ...bundle.citations.claims[0], sourceIds: ['unknown-citation'] }],
  }).success,
  false,
);

console.log(
  'Validated 8 proposed read-only visual envelopes and 1 cited answer; rejected unknown evidence/provenance, duplicate IDs, invalid geography, write flags and executable fields.',
);
