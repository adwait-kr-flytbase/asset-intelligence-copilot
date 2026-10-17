type HistoryRow = {
  role: string;
  content: string;
  resultContext?: unknown;
};

/** Bound each historical message so one long answer cannot hide its originating user request. */
export function conversationHistory(rowsNewestFirst: HistoryRow[], budget = 24_000) {
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  let remaining = budget;
  for (const row of rowsNewestFirst) {
    if (row.role !== 'user' && row.role !== 'assistant') continue;
    const limit = row.role === 'user' ? 8_000 : 2_500;
    const excerpt =
      row.content.length > limit
        ? `${row.content.slice(0, limit)}\n[Historical message shortened; do not infer omitted details.]`
        : row.content;
    const context =
      row.role === 'assistant' && row.resultContext
        ? `\nServer-retained historical result context (not fresh evidence): ${JSON.stringify(row.resultContext).slice(0, 2000)}`
        : '';
    const content = excerpt + context;
    if (!content || content.length > remaining) continue;
    history.unshift({ role: row.role, content });
    remaining -= content.length;
  }
  // A bounded history may start mid-turn. Keep a user turn as the starting boundary.
  while (history[0]?.role === 'assistant') history.shift();
  return history;
}
