import { describe, expect, it } from 'vitest';
import { deriveProduction, readTemperatureRule } from './rules.js';

describe('production rule evidence', () => {
  const manual =
    '# Manual\n\n### Production temperature rule\nAt least **15 °C above ambient**.\n\n### Alarm\nAbove 85 °C.';
  it('uses the applicable production clause, including equality and hot idle readings', () => {
    expect(readTemperatureRule(manual)).toMatchObject({ thresholdC: '15', startLine: 3 });
    expect(deriveProduction('43.1', '51.6', '15')).toEqual({ deltaC: '8.5', producing: false });
    expect(deriveProduction('19.9', '34.9', '15')).toEqual({ deltaC: '15', producing: true });
    expect(deriveProduction('19.9', '39.9', '20')).toEqual({ deltaC: '20', producing: true });
  });
  it('does not substitute an alarm threshold or silently accept ambiguous rules', () => {
    expect(readTemperatureRule('# Manual\nAbove 85 °C')).toBeNull();
    expect(readTemperatureRule(manual.replace('15 °C', 'fifteen °C'))).toBeNull();
  });
});
