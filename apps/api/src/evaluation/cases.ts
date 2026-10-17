export type EvalCase = {
  fixtureProfile?: 'alternate';
  id: string;
  question: string;
  assetId: string | null;
  toolGoals: { id: string; anyOf: string[] }[];
  /** Partial input/output matches on the SAME actual executed call, independent of prose. */
  toolChecks?: {
    id: string;
    toolName: string | string[];
    input?: Record<string, unknown> | Record<string, unknown>[];
    output?: Record<string, unknown>;
  }[];
  sourceGroups: { id: string; anyOf: string[] }[];
  responseCriteria: { id: string; expected: string }[];
  /** Explicit required facts in prose; complements, never proves, semantic grounding. */
  responseChecks?: { id: string; anyOf: string[] }[];
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
    id: 'sample-incident-follow-up',
    responseChecks: [
      { id: 'containment-observation', anyOf: ['7 hours', '7 hrs', '7h', 'seven hours', '7-hour'] },
      { id: 'containment-limit', anyOf: ['4 hours', '4 hrs', '4h', 'four hours', '4-hour'] },
      {
        id: 'verification-due-date',
        anyOf: ['2026-08-10', '10 August 2026', 'August 10, 2026', '10 Aug 2026', 'Aug 10, 2026'],
      },
      {
        id: 'notice-response-due-date',
        anyOf: ['2026-07-30', '30 July 2026', 'July 30, 2026', '30 Jul 2026', 'Jul 30, 2026'],
      },
    ],
    assetId: 'WELL-0001',
    question:
      'Review WELL-0001’s June 2026 spill. Check the report and company procedures. As of 17 October 2026, which deadlines were missed, what remains open, and what should I follow up on first? Do we know whether the fine was paid?',
    toolGoals: [
      { id: 'read-rules', anyOf: ['getApplicableProcedures'] },
      { id: 'read-incident-records', anyOf: ['getOperationalRecords'] },
      { id: 'read-narrative', anyOf: ['readEvidence'] },
    ],
    toolChecks: [
      {
        id: 'retain-later-linked-site-inspection',
        toolName: 'getOperationalRecords',
        output: { records: [{ id: 'REG-0001-003', status: 'open' }] },
      },
      {
        id: 'verification-calendar-deadline',
        toolName: 'calculateDeadline',
        input: { triggerDate: '2026-06-11', withinDays: 60 },
        output: { dueDate: '2026-08-10', overdueCalendarDays: 68, completion: 'not-assessed' },
      },
      {
        id: 'notice-response-calendar-deadline',
        toolName: 'calculateDeadline',
        input: { triggerDate: '2026-06-30', withinDays: 30 },
        output: { dueDate: '2026-07-30', overdueCalendarDays: 79, completion: 'not-assessed' },
      },
    ],
    sourceGroups: [
      { id: 'notice', anyOf: ['REG-0001-002'] },
      { id: 'follow-up', anyOf: ['REG-0001-003'] },
      {
        id: 'report',
        anyOf: ['assets/WELL-0001/maintenance-reports/MNT-0001-june-2026-flowline-spill.md'],
      },
    ],
    responseCriteria: [
      {
        id: 'missed-response-times',
        expected:
          'Explicitly state written spill reporting took 41 hours versus the 24-hour SR-01 limit, and containment about 7 hours versus the 4-hour SR-02 limit, citing the report/events and SOP.',
      },
      {
        id: 'overdue-today',
        expected:
          'Verification was due 10 August 2026 (60 days after 11 June discovery) and remains overdue as of 17 October. NOV response was due 30 July 2026 (30 days after 30 June notice); no response is recorded and notice remains open. Do not assess these deadlines only at end of June.',
      },
      {
        id: 'action-and-limits',
        expected:
          'Prioritize following up the NOV response and agency remediation verification with exact dates and supporting evidence; recommendations are not tasks already created. The open notice records a $5,000 fine, but payment status is unknown. Do not say it is unpaid or declare other protocols fully compliant without checking them.',
      },
    ],
  },
  {
    id: 'sample-downtime-ranking',
    assetId: null,
    question:
      'Which three wells in Northeast Block 7 had the most inspection-derived downtime between 16 June and 16 October 2026? Give days and sources.',
    toolGoals: [
      {
        id: 'calculate-complete-ranking',
        anyOf: [
          'analyzeOperations',
          'analyzeAssetOperations',
          'analyzeAreaOperations',
          'analyzeFleetOperations',
        ],
      },
    ],
    toolChecks: [
      {
        id: 'ranking-values-and-window',
        toolName: [
          'analyzeOperations',
          'analyzeAssetOperations',
          'analyzeAreaOperations',
          'analyzeFleetOperations',
        ],
        input: [
          {
            metric: 'downtime',
            scope: { kind: 'area' },
            window: { from: '2026-06-16', through: '2026-10-16' },
          },
          { metric: 'downtime', from: '2026-06-16', through: '2026-10-16' },
        ],
        output: {
          coverage: { assetsEvaluated: 50, kind: 'complete-filtered-input' },
          rows: [
            { assetId: 'WELL-0121', downtimeDays: 49 },
            { assetId: 'WELL-0107', downtimeDays: 42 },
            { assetId: 'WELL-0138', downtimeDays: 42 },
          ],
        },
      },
    ],
    sourceGroups: [{ id: 'leading-well', anyOf: ['WELL-0121'] }],
    responseCriteria: [
      {
        id: 'ranking',
        expected:
          'WELL-0121 has 49 days; WELL-0107 and WELL-0138 have 42 each. Either order for the tied pair is valid.',
      },
      {
        id: 'method',
        expected:
          'Downtime comes from seven days per non-producing inspection in the requested period; do not substitute repair duration or invent an asset for the area.',
      },
    ],
  },
  {
    id: 'sample-corrected-spills',
    assetId: 'WELL-0001',
    question:
      'How many real spills has WELL-0001 had from 1 January 2022 through 17 October 2026, and what total volume? Include corrections.',
    toolGoals: [
      {
        id: 'calculate-corrected-events',
        anyOf: [
          'analyzeOperations',
          'analyzeAssetOperations',
          'analyzeAreaOperations',
          'analyzeFleetOperations',
        ],
      },
    ],
    toolChecks: [
      {
        id: 'corrected-totals-and-scope',
        toolName: [
          'analyzeOperations',
          'analyzeAssetOperations',
          'analyzeAreaOperations',
          'analyzeFleetOperations',
        ],
        input: [
          {
            metric: 'spills',
            scope: { kind: 'asset', assetId: 'WELL-0001' },
            window: { from: '2022-01-01', through: '2026-10-17' },
          },
          { metric: 'spills', assetId: 'WELL-0001', from: '2022-01-01', through: '2026-10-17' },
        ],
        output: { totals: { spillCount: 6, totalBbl: '15.1', excludedFalsePositives: 1 } },
      },
    ],
    sourceGroups: [{ id: 'correction', anyOf: ['CTX-0001-001'] }],
    responseCriteria: [
      {
        id: 'totals',
        expected:
          'Six effective spills total 15.1 bbl. Seven raw detections include one corrected rainwater false positive; do not count it as crude.',
      },
    ],
  },

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
