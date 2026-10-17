import type { DatabaseConnection } from '@repo/db';
import {
  assessBypasses,
  assessFreezeChecks,
  assessGasResponses,
  assessSpillLetter,
  assessStatusDisagreements,
} from './compliance.js';
import { operationalDatasetLoader } from './dataset.js';
import { assessPumpRecall, assessTeamDirectory, inspectOperationalRecords } from './equipment.js';
import { type InspectionSummaryInput, summarizeInspections } from './inspection-summary.js';
import {
  assessRegionalTemperatures,
  assessRepairDelays,
  assessRepairPriorities,
} from './maintenance.js';
import type { AssessmentInput, OperationalAssessment } from './types.js';
import { makeAssessment } from './types.js';

export const operationalTopics = [
  'gas-responses',
  'temporary-bypasses',
  'status-disagreements',
  'spill-letter',
  'freeze-checks',
  'pump-recall',
  'team-directory',
  'operator-notes',
  'repair-priorities',
  'repair-delays',
  'regional-temperatures',
  'data-availability',
  'inspection-summary',
] as const;
export type OperationalQuery = InspectionSummaryInput & {
  topic: (typeof operationalTopics)[number];
  query?: string;
  kind?: 'operator_note' | 'note' | 'maintenance' | 'inspection';
  currentStatus?: 'not-producing' | 'producing';
};
export type OperationsPort = (
  input: OperationalQuery,
  signal?: AbortSignal,
) => Promise<OperationalAssessment>;
export function createOperationsService(
  pool: DatabaseConnection['pool'],
  namespace: string,
  asOf: string,
): OperationsPort {
  const load = operationalDatasetLoader(pool, namespace, asOf);
  return async (input, signal) => {
    const data = await load(signal);
    for (const [field, records] of [
      ['area', data.areas],
      ['team', data.teams],
    ] as const) {
      const value = input[field];
      if (
        value &&
        !records.some((record) =>
          [record.id, String(record.raw.name ?? '')].some(
            (candidate) => candidate.toLowerCase() === value.toLowerCase(),
          ),
        )
      )
        throw new Error(
          `Unknown ${field} filter ${value}. Use an exact recorded ID/name: ${records.map((record) => `${record.id} (${record.raw.name})`).join(', ')}. A team is not an area; invalid filters do not mean zero records.`,
        );
    }

    const inputWithClock = { ...input, through: input.through ?? asOf.slice(0, 10) };
    switch (input.topic) {
      case 'inspection-summary':
        return summarizeInspections(data, inputWithClock);
      case 'data-availability': {
        const fields = [
          ...new Set(data.inspections.flatMap((record) => Object.keys(record.raw))),
        ].sort();
        const pressure = fields.filter((field) => /pressure/i.test(field));
        const manuals = data.documents.filter((doc) => /well-types\//.test(doc.source.path));
        return makeAssessment(
          data,
          input,
          'data-availability',
          'Available field measurements',
          [
            { key: 'inspectionRecords', label: 'Inspection records checked', valueType: 'integer' },
            { key: 'measurementFields', label: 'Recorded fields', valueType: 'string' },
          ],
          [
            {
              row: {
                inspectionRecords: data.inspections.length,
                measurementFields: fields.join(', '),
              },
              text: `Checked all ${data.inspections.length} inspection records across ${data.assets.length} wells. ${pressure.length ? `Pressure-related fields found: ${pressure.join(', ')}; their meaning requires validation.` : 'No pressure measurement field exists in these inspection records. Reservoir pressure cannot be mapped from this dataset. Maximum allowable working pressures in well manuals are equipment ratings, not measured reservoir pressure, and surface temperatures cannot establish a pressure map.'}`,
              sources: [
                ...data.inspections.slice(0, 1).map((r) => r.source),
                ...manuals.map((d) => d.source),
              ],
            },
          ],
        );
      }
      case 'gas-responses':
        return assessGasResponses(data, inputWithClock);
      case 'temporary-bypasses':
        return assessBypasses(data, inputWithClock);
      case 'status-disagreements':
        return assessStatusDisagreements(data, inputWithClock);
      case 'spill-letter': {
        const letter = data.documents.find((doc) =>
          /Letter from the State Oil & Gas Commission/.test(doc.markdown),
        );
        const scopeDate = letter?.markdown.match(/since (\d+ \w+ \d{4})/)?.[1];
        const parsed = scopeDate ? Date.parse(`${scopeDate} 00:00:00 GMT`) : NaN;
        const effective = {
          ...inputWithClock,
          from: Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : undefined,
          through: asOf.slice(0, 10),
        };
        const result = assessSpillLetter(data, effective);
        result.executedParameters = effective;
        return result;
      }
      case 'freeze-checks':
        return assessFreezeChecks(data, inputWithClock);
      case 'pump-recall':
        return assessPumpRecall(data, inputWithClock);
      case 'team-directory':
        return assessTeamDirectory(data, inputWithClock);
      case 'operator-notes': {
        const { topic: _dispatchTopic, ...filters } = inputWithClock;
        return inspectOperationalRecords(data, filters);
      }
      case 'repair-priorities':
        return assessRepairPriorities(data, inputWithClock);
      case 'repair-delays':
        return assessRepairDelays(data, inputWithClock);
      case 'regional-temperatures':
        return assessRegionalTemperatures(data, inputWithClock);
    }
  };
}
