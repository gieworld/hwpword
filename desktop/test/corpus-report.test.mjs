import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRoundTrip, lossCount, normalizeText, toMarkdown } from '../corpus/lib/report.mjs';

test('re-pagination alone is not a text difference', () => {
  const before = { pages: 2, sections: 1, pageTexts: ['Hello ', 'world\n'] };
  const after = { pages: 1, sections: 1, pageTexts: ['Hello world'] };
  assert.equal(normalizeText(before.pageTexts), 'Helloworld');
  assert.deepEqual(compareRoundTrip(before, after), { textEqual: true, pagesEqual: false, sectionsEqual: true });
});

test('changed text is detected', () => {
  const before = { pages: 1, sections: 1, pageTexts: ['신청서 성명'] };
  const after = { pages: 1, sections: 1, pageTexts: ['신청서'] };
  assert.equal(compareRoundTrip(before, after).textEqual, false);
});

test('loss count comes from the export report', () => {
  assert.equal(lossCount('{"count":2,"losses":[{},{}]}'), 2);
  assert.equal(lossCount('{"count":0,"losses":[]}'), 0);
  assert.equal(lossCount('not json'), null);
});

test('report counts problems and escapes table cells', () => {
  const md = toMarkdown([
    { file: 'ok.hwp', format: 'hwp', pages: 3, renderErrors: 0, textEqual: true, pagesEqual: true, sectionsEqual: true, lossCount: 0, missingFonts: [] },
    { file: 'bad|name.hwp', error: 'open: password required' },
    { file: 'drift.hwpx', format: 'hwpx', pages: 5, renderErrors: 1, textEqual: false, pagesEqual: false, sectionsEqual: true, lossCount: 1, missingFonts: ['함초롬바탕'] },
  ], '2026-09-16T00:00:00.000Z');
  assert.match(md, /3 files, 2 with problems\./);
  assert.match(md, /\| ok\.hwp \| hwp \| 3 \| yes \| yes \| yes \| yes \| 0 \| — \|  \|/);
  assert.match(md, /\| bad\\\|name\.hwp \| — \| — \| — \| — \| — \| — \| — \| — \| open: password required \|/);
  assert.match(md, /\| drift\.hwpx \| hwpx \| 5 \| \*\*1 failed\*\* \| \*\*NO\*\* \| \*\*NO\*\* \| yes \| 1 \| 함초롬바탕 \|  \|/);
});

test('section drift or content loss alone counts as a problem', () => {
  const base = { format: 'hwp', pages: 1, renderErrors: 0, textEqual: true, pagesEqual: true, missingFonts: [] };
  const md = toMarkdown([
    { ...base, file: 'sections.hwp', sectionsEqual: false, lossCount: 0 },
    { ...base, file: 'lossy.hwp', sectionsEqual: true, lossCount: 2 },
    { ...base, file: 'clean.hwp', sectionsEqual: true, lossCount: 0 },
  ], '2026-09-17T00:00:00.000Z');
  assert.match(md, /3 files, 2 with problems\./);
  assert.match(md, /\| sections\.hwp \| hwp \| 1 \| yes \| yes \| yes \| \*\*NO\*\* \| 0 \| — \|  \|/);
  assert.match(md, /\| Pages same after save \| Sections same after save \|/);
});
