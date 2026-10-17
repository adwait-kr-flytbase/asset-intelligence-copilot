/** Narrow supported manual clause grammar. Unknown/changed language fails closed. */
export const isFalsePositiveCorrection = (text: string) => /\bnot a (?:crude )?spill\b/i.test(text);

export function readTemperatureRule(markdown: string) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => /^#{2,3} .*Production temperature rule\s*$/i.test(line));
  if (start < 0) return null;
  const next = lines.findIndex((line, index) => index > start && /^#{1,3} /.test(line));
  const end = next < 0 ? lines.length : next;
  const clause = lines.slice(start, end).join('\n').replaceAll('**', '');
  const matches = [...clause.matchAll(/at least\s+(\d+(?:\.\d+)?)\s*°C above\s+ambient/gi)];
  const thresholdC = matches[0]?.[1];
  if (matches.length !== 1 || !thresholdC) return null;
  return { thresholdC, startLine: start + 1, endLine: end };
}

function decimal(value: string) {
  if (!/^-?\d+(?:\.\d+)?$/.test(value) || value.length > 40)
    throw new Error('Unsupported decimal measurement.');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  return { integer: BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n), scale: fraction.length };
}

export function deriveProduction(ambient: string, wellhead: string, threshold: string) {
  const values = [decimal(ambient), decimal(wellhead), decimal(threshold)] as const;
  const scale = Math.max(...values.map((value) => value.scale));
  const scaled = (value: (typeof values)[number]) =>
    value.integer * 10n ** BigInt(scale - value.scale);
  const delta = scaled(values[1]) - scaled(values[0]);
  const digits = (delta < 0n ? -delta : delta).toString().padStart(scale + 1, '0');
  const formatted = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  const deltaC = `${delta < 0n ? '-' : ''}${formatted}`
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return { deltaC, producing: delta >= scaled(values[2]) };
}
