/** Minimum product capability coverage. Targets are not executable/passing eval cases. */
export const capabilityCatalogue = [
  {
    examples: ['Q1'],
    capability: 'Current operational status',
    needs: ['asset context', 'applicable rules', 'attributed explanations'],
    state: 'runnable-baseline',
  },
  {
    examples: ['Q2'],
    capability: 'Fleet/area filtering with explanations',
    needs: ['fleet query', 'per-asset status', 'complete result coverage'],
    state: 'target',
  },
  {
    examples: ['Q3'],
    capability: 'Historical measurements and trends',
    needs: ['inspection ranges', 'time-series result', 'production markers'],
    state: 'target',
  },
  {
    examples: ['Q4'],
    capability: 'Corrected event counts and totals',
    needs: ['effective corrections', 'exhaustive event aggregation'],
    state: 'target',
  },
  {
    examples: ['Q5', 'Q6'],
    capability: 'Downtime and rankings',
    needs: ['inspection-based calculation', 'time/area filters', 'tie semantics'],
    state: 'target',
  },
  {
    examples: ['Q7', 'Q8'],
    capability: 'Spatial and grouped temporal analysis',
    needs: ['corrected events', 'coordinates', 'grouped aggregates'],
    state: 'target',
  },
  {
    examples: ['Q9', 'Q10'],
    capability: 'Evidence-backed obligation assessment',
    needs: [
      'narrative report facts',
      'applicable procedure clauses',
      'deadlines and unresolved evidence',
    ],
    state: 'target',
  },
  {
    examples: ['Q11'],
    capability: 'Private cross-conversation reference resolution',
    needs: ['trusted ownership', 'persistent entity/result references', 'cost aggregation'],
    state: 'target',
  },
  {
    examples: ['Q12', 'Q13'],
    capability: 'Scoped corrections and downstream recalculation',
    needs: [
      'validated correction workflow',
      'original preservation',
      'effective-value calculations',
    ],
    state: 'target',
  },
  {
    examples: ['Q14'],
    capability: 'Scoped user policy overrides',
    needs: ['policy provenance', 'type applicability', 'repeat-event calculation'],
    state: 'target',
  },
  {
    examples: ['Q15'],
    capability: 'Shared effective knowledge across users',
    needs: ['accepted corrections', 'shared read visibility', 'provenance'],
    state: 'target',
  },
  {
    examples: ['Q16'],
    capability: 'Shared notes with private conversation isolation',
    needs: ['shared note workflow', 'private memory boundary'],
    state: 'target',
  },
  {
    examples: ['Q17', 'Q18'],
    capability: 'Unresolved disagreements and conflicting sources',
    needs: ['targeted history', 'attributed assertions', 'no silent promotion to correction'],
    state: 'target',
  },
] as const;

export const statefulSequences = [
  {
    examples: ['Q6', 'Q11'],
    state: 'Same user retains previous ranked entity set across conversations.',
  },
  {
    examples: ['Q12', 'Q2', 'Q15'],
    state: 'Accepted temperature correction changes later results and is shared with provenance.',
  },
  {
    examples: ['Q13', 'Q15'],
    state: 'Accepted volume correction changes subsequent obligations and shared results.',
  },
  {
    examples: ['Q14'],
    state: 'Compare before/after scoped user policy; unrelated types retain original rules.',
  },
  {
    examples: ['Q11', 'Q16'],
    state: 'Owner can recall prior references; other users cannot; shared notes remain available.',
  },
] as const;
