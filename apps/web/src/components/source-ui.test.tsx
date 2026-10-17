import type { AppEvidence } from '@repo/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { sourceLocation, structuredExcerpt } from './EvidenceReader';
import Markdown from './Markdown';

test('structured evidence preserves exact decimal lexemes and unknown values', () => {
  expect(
    structuredExcerpt(
      '{"amount":9007199254740993.123400,"zero":0.000,"missing":null,"observed":false}',
    ),
  ).toEqual({ amount: '9007199254740993.123400', zero: '0.000', missing: null, observed: false });
  expect(structuredExcerpt('{"amount":')).toBeNull();
  expect(structuredExcerpt('# Manual')).toBeNull();
});
test('source locators show original line ranges and JSON pointers', () => {
  const source = {
    locator: { startLine: 12, endLine: 19, jsonPointer: '/inspection/0' },
  } as AppEvidence;
  expect(sourceLocation(source)).toBe('Lines 12–19 · /inspection/0');
  expect(sourceLocation({ ...source, locator: { line: 7 } })).toBe('Line 7');
});
test('document reader renders Markdown tables without executable HTML or fetched images', () => {
  const html = renderToStaticMarkup(
    <Markdown
      text={
        '# Manual\n\n| A | B |\n|---|---|\n| x | y |\n\n<script>alert(1)</script>\n\n![attachment](https://example.com/private.png)\n\n[unsafe](javascript:alert(1))'
      }
    />,
  );
  expect(html).toContain('<table>');
  expect(html).toContain('<h1>Manual</h1>');
  expect(html).not.toContain('<script');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('javascript:');
});
