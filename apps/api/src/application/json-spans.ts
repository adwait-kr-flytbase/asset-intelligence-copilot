/** Locate retained JSON values without converting numeric lexemes to JS numbers. */
export function indexJsonSpans(text: string, wanted: Set<string>) {
  const spans = new Map<string, { start: number; end: number }>();
  let cursor = 0;
  const fail = (): never => {
    throw new Error('Retained JSON evidence is invalid.');
  };
  const whitespace = () => {
    while (' \t\r\n'.includes(text[cursor] ?? '\0')) cursor++;
  };
  function stringEnd() {
    if (text[cursor++] !== '"') fail();
    while (cursor < text.length) {
      const character = text[cursor++];
      if (character === '"') return;
      if (character === '\\') cursor++;
      else if (character && character.charCodeAt(0) < 32) fail();
    }
    fail();
  }
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  function value(pointer: string, depth: number) {
    if (depth > 200) fail();
    whitespace();
    const start = cursor;
    const token = text[cursor];
    if (token === '{') {
      cursor++;
      whitespace();
      const keys = new Set<string>();
      if (text[cursor] !== '}') {
        for (;;) {
          whitespace();
          const keyStart = cursor;
          stringEnd();
          const key: string = JSON.parse(text.slice(keyStart, cursor));
          if (keys.has(key)) fail();
          keys.add(key);
          whitespace();
          if (text[cursor++] !== ':') fail();
          value(`${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, depth + 1);
          whitespace();
          if (text[cursor] !== ',') break;
          cursor++;
        }
      }
      if (text[cursor++] !== '}') fail();
    } else if (token === '[') {
      cursor++;
      whitespace();
      let index = 0;
      if (text[cursor] !== ']') {
        for (;;) {
          value(`${pointer}/${index++}`, depth + 1);
          whitespace();
          if (text[cursor] !== ',') break;
          cursor++;
        }
      }
      if (text[cursor++] !== ']') fail();
    } else if (token === '"') stringEnd();
    else if (text.startsWith('true', cursor)) cursor += 4;
    else if (text.startsWith('false', cursor)) cursor += 5;
    else if (text.startsWith('null', cursor)) cursor += 4;
    else {
      number.lastIndex = cursor;
      const match = number.exec(text);
      if (!match) fail();
      cursor = number.lastIndex;
    }
    if (wanted.has(pointer)) spans.set(pointer, { start, end: cursor });
  }
  value('', 0);
  whitespace();
  if (cursor !== text.length) fail();
  return spans;
}
