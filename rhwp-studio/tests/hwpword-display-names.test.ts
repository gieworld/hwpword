import test from 'node:test';
import assert from 'node:assert/strict';
import { fontDisplayName, romanizeHangul, romanizeName, styleDisplayName } from '../src/ui/display-names.ts';

test('romanizes Hangul syllables with Revised Romanization letters', () => {
  assert.equal(romanizeHangul('한글'), 'hangeul');
  assert.equal(romanizeName('휴먼명조'), 'Hyumeonmyeongjo');
  assert.equal(romanizeName('신명 견고딕'), 'Sinmyeong Gyeongodik');
  assert.equal(romanizeName('HY헤드라인M'), 'HYhedeurainM');
  assert.equal(romanizeName('문화쓰기'), 'Munhwasseugi');
});

test('known fonts get English names, unknown Korean fonts are romanized, others pass through', () => {
  assert.equal(fontDisplayName('함초롬바탕'), 'HCR Batang');
  assert.equal(fontDisplayName('맑은 고딕'), 'Malgun Gothic');
  assert.equal(fontDisplayName('문화쓰기'), 'Munhwasseugi');
  assert.equal(fontDisplayName('Arial'), 'Arial');
});

test('built-in style names get English names, others are romanized', () => {
  assert.equal(styleDisplayName('바탕글'), 'Normal');
  assert.equal(styleDisplayName('개요 3'), 'Outline 3');
  assert.equal(styleDisplayName('차례 2'), 'TOC 2');
  assert.equal(styleDisplayName('쪽 번호'), 'Page Number');
  assert.equal(styleDisplayName('제목'), 'Jemok');
  assert.equal(styleDisplayName('Heading 1'), 'Heading 1');
});

test('a decomposed (NFD) name still hits the table and still romanizes', () => {
  assert.equal(fontDisplayName('함초롬바탕'.normalize('NFD')), 'HCR Batang');
  assert.equal(fontDisplayName('문화쓰기'.normalize('NFD')), 'Munhwasseugi');
  assert.equal(styleDisplayName('바탕글'.normalize('NFD')), 'Normal');
});

test('an Object.prototype key is not mistaken for a known name', () => {
  for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    assert.equal(fontDisplayName(key), key);
    assert.equal(styleDisplayName(key), key);
  }
});

test('display names never contain Hangul', () => {
  for (const name of ['함초롬돋움', '새굴림', '양재튼튼체B', '가나다 라마', 'ㄱㄴㄷ']) {
    assert.doesNotMatch(fontDisplayName(name), /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/, name);
    assert.doesNotMatch(styleDisplayName(name), /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/, name);
  }
});
