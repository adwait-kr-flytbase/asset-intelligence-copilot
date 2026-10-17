import type { OperatorContextPort } from '../agents/operator-context.js';
import type { OperationsPort } from '../evidence/operations/service.js';

/** Human reports overlay source records explicitly; private formatting stays person scoped. */
export function withOperatorContext(
  operations: OperationsPort,
  context: OperatorContextPort,
  latest: string,
): OperationsPort {
  return async (input, signal) => {
    const operator = await context.read();
    const query = { ...input };
    if (
      /\bmy (?:area|team)\b/i.test(latest) &&
      !/whole field|across all|not just my area/i.test(latest)
    ) {
      query.team = operator.persona.teamId;
      if (query.area === operator.persona.team || query.area === operator.persona.teamId)
        delete query.area;
    }
    const result = await operations(query, signal);
    result.executedParameters = { ...query, ...result.executedParameters };
    if (input.topic === 'pump-recall') {
      const direct = operator.memories.filter(
        (memory) =>
          memory.kind === 'replacement-report' &&
          memory.confidence === 'direct-report' &&
          memory.assetId,
      );
      const matching = new Set(result.rows.map((row) => String(row.assetId)));
      const removed = new Set(
        direct.filter((memory) => matching.has(memory.assetId!)).map((memory) => memory.assetId),
      );
      const before = result.rows.length;
      result.rows = result.rows.filter((row) => !removed.has(String(row.assetId)));
      const difference = before - result.rows.length;
      result.coverage.totalRows -= difference;
      result.coverage.returnedRows = result.rows.length;
      if (result.summary) {
        result.summary.totalRows = result.coverage.totalRows;
        result.summary.returnedRows = result.rows.length;
      }
      if (difference)
        result.warnings.push(
          `${before} source-documented recalled installations minus ${difference} attributed replacement report(s) = ${result.rows.length} outstanding displayed installations; operator reports await work-order confirmation.`,
        );
      result.facts = result.facts.filter(
        (fact, index) => index === 0 || ![...removed].some((id) => id && fact.text.includes(id)),
      );
      if (result.facts[0])
        result.facts[0].text = result.facts[0].text.replace(
          /: \d+ matching records/,
          `: ${result.coverage.totalRows} outstanding recalled installations after attributed updates`,
        );
      for (const memory of direct)
        if (removed.has(memory.assetId)) {
          const statement = `${memory.assetId}: excluded from the outstanding recall list based on ${memory.authorName}'s direct replacement report (${memory.id}, ${memory.at}), awaiting its work order. This is an attributed operator update, not a confirmed maintenance record.`;
          result.facts.push({ text: statement, sourceIds: [] });
          result.warnings.push(statement);
        }
      for (const memory of operator.memories.filter(
        (memory) => memory.kind === 'replacement-report' && memory.confidence === 'hearsay',
      ))
        result.facts.push({
          text: `${memory.assetId}: ${memory.authorName} supplied a second-hand replacement report (${memory.id}); it is unverified and does not clear the recall.`,
          sourceIds: [],
        });
    }
    const preferences = operator.memories
      .filter((m) => m.kind === 'preference' && m.authorId === operator.persona.id)
      .map((m) => m.text)
      .join('\n');
    if (/sort.*area|area.*well ID/i.test(preferences))
      result.rows.sort(
        (a, b) =>
          String(a.area ?? '').localeCompare(String(b.area ?? '')) ||
          String(a.assetId ?? '').localeCompare(String(b.assetId ?? '')),
      );
    if (/costs?.*thousands|thousands.*dollars/i.test(preferences)) {
      for (const column of result.columns.filter((c) => /Usd$/.test(c.key))) {
        const original = column.key;
        column.key = original.replace(/Usd$/, 'ThousandsUsd');
        column.unit = 'thousand USD';
        column.label = column.label.replace(/USD/, 'thousand USD');
        for (const row of result.rows) {
          const value = row[original];
          row[column.key] =
            value === null
              ? null
              : (Number(value) / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
          delete row[original];
        }
      }
      result.facts.push({
        text: `Costs are displayed in thousands of dollars under ${operator.persona.name}'s private preference; source amounts remain unchanged.`,
        sourceIds: [],
      });
    }
    return result;
  };
}
