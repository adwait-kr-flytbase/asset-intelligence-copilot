import type { Snapshot } from './protocol';

// Scripted explanations read validated snapshot fields. They do not infer physical causes.
export function explainSnapshot(text: string, snapshot: Snapshot, selected: string) {
  if (snapshot.phase !== 'ready') return null;
  const row = snapshot.result.rows.find((w) => w.id === selected);
  if (!row) return null;
  const question = text
    .trim()
    .replace(/[?.!]+$/, '')
    .toLowerCase();
  const scope = `${row.id} · ${snapshot.result.period}. `;
  if (question === 'why this status' || question === 'explain this status') {
    return {
      text:
        scope +
        `The latest inspection records a temperature difference of ${row.deltaC}°C against this well's ${row.thresholdC}°C threshold. The synthetic record classifies it as ${row.producing ? 'producing' : 'below the production threshold'}. This indicates inspection status; it does not establish the physical cause.`,
      sourceIds: row.sourceIds,
    };
  }
  if (question === 'how is downtime calculated') {
    return {
      text:
        scope +
        `The synthetic result records ${row.downtimeDays} days of downtime for this well. Each below-threshold weekly inspection contributes seven days; a missing observation does not add downtime. This is an inspection-based estimate, not measured sensor outage time.`,
      sourceIds: row.sourceIds,
    };
  }
  if (question === 'any conflicting records') {
    return {
      text:
        scope +
        (row.conflicts.length
          ? row.conflicts.join(' ')
          : 'No conflicts are flagged in this synthetic result. That does not establish that every real-world record agrees.'),
      sourceIds: row.sourceIds,
    };
  }
  return null;
}
