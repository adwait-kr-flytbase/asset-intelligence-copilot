export type EvalCase = {
  fixtureProfile?: 'alternate';
  id: string;
  question: string;
  assetId: string;
  toolGoals: { id: string; anyOf: string[] }[];
  sourceGroups: { id: string; anyOf: string[] }[];
  responseCriteria: { id: string; expected: string }[];
};

/** Independent expected facts. These are evaluation data, never agent prompts. */
export const controlledCases: EvalCase[] = [
  {
    id: 'unseen-type-boundary',
    fixtureProfile: 'alternate',
    assetId: 'WELL-ALTERNATE',
    question:
      'Check WELL-ALTERNATE. Does the latest reading meet its type-specific production rule? There may be a conflicting note.',
    toolGoals: [{ id: 'inspect-current-status', anyOf: ['getOperationalContext'] }],
    sourceGroups: [
      { id: 'measurement', anyOf: ['INS-OTHER'] },
      { id: 'rule', anyOf: ['MANUAL-OTHER'] },
      { id: 'claim', anyOf: ['NOTE-OTHER'] },
    ],
    responseCriteria: [
      {
        id: 'boundary',
        expected:
          'Producing: 42.6°C minus 22.1°C equals 20.5°C, exactly meeting the alternate manual’s 20.5°C threshold. Do not reuse the baseline 15°C rule or non-producing answer.',
      },
      {
        id: 'attribution',
        expected:
          'The note claiming shut-in is attributed and unconfirmed; it does not override the latest measured classification.',
      },
    ],
  },
  {
    id: 'status-and-conflict',
    assetId: 'WELL-TEST',
    question: 'Is WELL-TEST producing? Explain the measurements and any conflicting information.',
    toolGoals: [{ id: 'inspect-current-status', anyOf: ['getOperationalContext'] }],
    sourceGroups: [
      { id: 'measurement', anyOf: ['INS-TEST'] },
      { id: 'rule', anyOf: ['MANUAL-TEST'] },
      { id: 'conflicting-note', anyOf: ['NOTE-TEST'] },
    ],
    responseCriteria: [
      {
        id: 'status',
        expected:
          'Not producing: wellhead 51.6°C minus ambient 43.1°C is 8.5°C, below the applicable 15°C threshold.',
      },
      {
        id: 'conflict',
        expected:
          'Disclose and attribute the operator claim that it is running as unconfirmed; do not replace the measured classification with that note.',
      },
      {
        id: 'grounding',
        expected:
          'Citations support their associated measurement, rule and attributed claim. Do not treat administrative active status as measured production.',
      },
    ],
  },
  {
    id: 'linked-report-explanation',
    assetId: 'WELL-TEST',
    question:
      'For WELL-TEST, find the report and explain why the repair shutdown lasted longer. Cite the original report.',
    toolGoals: [{ id: 'obtain-narrative', anyOf: ['readEvidence', 'searchEvidence'] }],
    sourceGroups: [{ id: 'report', anyOf: ['REPORT-LINKED'] }],
    responseCriteria: [
      {
        id: 'cause',
        expected:
          'The report attributes seven additional days to a replacement part being back-ordered. Cite REPORT-LINKED.',
      },
      {
        id: 'limits',
        expected:
          'Attribute the account to the report; do not invent additional causes or claim a future planned job completion is established fact.',
      },
    ],
  },
  {
    id: 'missing-evidence',
    assetId: 'WELL-ABSENT',
    question: 'Is WELL-ABSENT producing? What is its latest inspection?',
    toolGoals: [{ id: 'attempt-lookup', anyOf: ['getOperationalContext'] }],
    sourceGroups: [],
    responseCriteria: [
      {
        id: 'unknown',
        expected:
          'Say the well was not found in the available dataset. Production and latest inspection are unknown; invent neither.',
      },
      {
        id: 'scope',
        expected:
          'Do not substitute WELL-TEST or another well and do not interpret missing evidence as non-production.',
      },
    ],
  },
];

/** Original sample only; reference facts are pinned to the 17 October challenge clock. */
export const sampleCases: EvalCase[] = [
  {
    id: 'sample-q1',
    assetId: 'WELL-0001',
    question:
      'Is WELL-0001 producing right now? Who inspected it and what explains its current state?',
    toolGoals: [{ id: 'inspect-current-status', anyOf: ['getOperationalContext'] }],
    sourceGroups: [
      { id: 'measurement', anyOf: ['INS-0001-0203'] },
      { id: 'planned-work', anyOf: ['CTX-0001-003'] },
    ],
    responseCriteria: [
      {
        id: 'status',
        expected:
          'Latest inspection INS-0001-0203 on 15 October 2026 shows delta 3.2°C, below T200 threshold 15°C: not producing. Inspector Ryan Brooks, drone inspection.',
      },
      {
        id: 'plan',
        expected:
          'Attribute rod replacement since 7 October with expected return 20 October to Jake Morales’s note CTX-0001-003. It is a plan/explanation, not a completed repair or proven cause.',
      },
      {
        id: 'grounding',
        expected:
          'Cite the actual inspection/manual/note as applicable and distinguish stale administrative active status from measured production.',
      },
    ],
  },
  {
    id: 'sample-narrative',
    assetId: 'WELL-0001',
    question:
      'For WELL-0001 maintenance MNT-0001-028 in May 2026, what explains the extra shut-in time? Read the report and cite it.',
    toolGoals: [{ id: 'obtain-narrative', anyOf: ['readEvidence', 'searchEvidence'] }],
    sourceGroups: [
      { id: 'report', anyOf: ['assets/WELL-0001/maintenance-reports/MNT-0001-028.md'] },
    ],
    responseCriteria: [
      {
        id: 'cause',
        expected:
          'Report MNT-0001-028 says the well stayed shut in about seven days longer than the repair itself because the replacement part was back-ordered.',
      },
      {
        id: 'distinction',
        expected:
          'Do not confuse job duration (216 hours) with extra delay or inspection-derived downtime; cite the report narrative.',
      },
    ],
  },
];
