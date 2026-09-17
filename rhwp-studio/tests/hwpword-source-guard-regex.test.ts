import test from 'node:test';
import assert from 'node:assert/strict';
import { codeOnly, functionBodyFrom } from './support/source-guard.ts';

// The source guards scan real production files, which contain regex literals. A scanner that does
// not know what a regex literal is mistakes the characters inside one for code: a quote starts a
// string that never ends (swallowing the rest of the file, comments included), and a brace changes
// the brace depth. Both failure modes are silent — the guard stays green while it reads garbage —
// so they are pinned here. `// 한국어` marks text the guard must still see removed as a comment.

const NL = String.fromCharCode(10);

test('codeOnly: a regex literal containing a quote does not start a string', () => {
  const fixture = [
    'const escaped = text.replace(/"/g, "&quot;");',
    'const label = "keep me"; // 주석은 지워진다',
  ].join(NL);
  const code = codeOnly(fixture);
  assert.match(code, /replace\(\/"\/g/, 'the regex literal itself must survive');
  assert.match(code, /"keep me"/, 'a real string after the regex must survive');
  assert.doesNotMatch(code, /주석은 지워진다/, 'the comment must still be blanked out');
});

test('codeOnly: division is not read as a regex literal', () => {
  const fixture = ['const ratio = a / b + c / d; // 나눗셈 뒤 주석'].join(NL);
  const code = codeOnly(fixture);
  assert.match(code, /a \/ b \+ c \/ d;/, 'both divisions must survive untouched');
  assert.doesNotMatch(code, /나눗셈/, 'the comment must still be blanked out');
});

test('matchingIndex: a brace inside a regex literal does not close the block', () => {
  const fixture = [
    'function strip(text) {',
    '  const cleaned = text.replace(/[}]/g, "");',
    '  return cleaned;',
    '}',
    'const after = 1;',
  ].join(NL);
  const body = functionBodyFrom(fixture, 'function strip');
  assert.match(body, /return cleaned;/, 'the body must reach past the regex literal');
  assert.doesNotMatch(body, /const after/, 'the body must stop at the real closing brace');
});
