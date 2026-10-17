import type { Query } from '../../protocol';

export const starters: { query: Query; text: string }[] = [
  { query: 'attention', text: 'Which wells need attention?' },
  { query: 'downtime', text: 'Where are we losing production time?' },
  { query: 'spills', text: 'Show spills and conflicting records' },
];

export const operatorViews: { label: string; prompt: string; query: Query }[] = [
  { label: 'Spill map', prompt: 'Show spill locations across all wells on a map', query: 'spills' },
  {
    label: 'Temperature history',
    prompt: 'Compare wellhead and ambient temperature history for LAB-W01',
    query: 'attention',
  },
  {
    label: 'Repair costs',
    prompt: 'Compare recorded repair costs across all wells',
    query: 'downtime',
  },
  {
    label: 'Compliance deadlines',
    prompt: 'Show compliance obligations and deadlines across all wells',
    query: 'attention',
  },
  {
    label: 'Evidence timeline',
    prompt: 'Show the evidence timeline for LAB-W01',
    query: 'attention',
  },
  {
    label: 'Conflicting claims',
    prompt: 'Compare conflicting claims for LAB-W04',
    query: 'attention',
  },
  {
    label: 'Correction review',
    prompt: 'Review a proposed repair-log correction for LAB-W01',
    query: 'attention',
  },
  {
    label: 'Spill distribution',
    prompt: 'Show spill distribution by area and month as a heatmap',
    query: 'spills',
  },
];
