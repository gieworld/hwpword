import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from './support/source-guard.ts';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

/** Studio sources whose user-visible strings must be English. Each translation task appends its files. */
const ENGLISH_UI_SOURCES = [
  'src/main.ts',
  'src/command/commands/file.ts',
  'src/command/file-system-access.ts',
  'src/ui/dialog.ts',
  'src/ui/toast.ts',
  'src/ui/toolbar.ts',
  'src/ui/unsaved-changes-dialog.ts',
  'src/ui/hwp-password-dialog.ts',
  'src/ui/save-as-dialog.ts',
  'src/ui/pdf-print-dialog.ts',
  'src/ui/about-dialog.ts',
  'src/view/page-indicator.ts',
  'src/view/zoom-status-controls.ts',
  'src/ui/char-shape-dialog.ts',
  'src/ui/para-shape-dialog.ts',
  'src/ui/para-shape-tab-builders.ts',
  'src/ui/style-dialog.ts',
  'src/ui/style-edit-dialog.ts',
];

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;

/**
 * Korean that is document data, not UI: font families that must match fonts named inside HWP files,
 * and Hancom's attribution sentence, whose exact wording the HWP spec licence requires. Longer names first.
 */
const KOREAN_DATA = [
  '본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.',
  '함초롬바탕',
  '함초롬돋움',
  '한컴바탕',
  '한컴돋움',
  '맑은 고딕',
  '나눔고딕',
  '나눔명조',
  '바탕체',
  '돋움체',
  '굴림체',
  '궁서체',
  '바탕',
  '돋움',
  '굴림',
  '궁서',
];

const KEEP_MARKER = 'hwpword-keep-korean';

function withoutKoreanData(line: string): string {
  return KOREAN_DATA.reduce((text, name) => text.split(name).join(''), line);
}

function koreanUiLines(relativePath: string): string[] {
  const raw = readFileSync(join(rootDir, relativePath), 'utf8').split('\n');
  const code = codeOnly(raw.join('\n')).split('\n');
  return code.flatMap((line, index) => {
    if (raw[index].includes(KEEP_MARKER)) return [];
    if (/\bconsole\.(log|info|warn|error|debug)\(/.test(line)) return [];
    return HANGUL.test(withoutKoreanData(line)) ? [`${relativePath}:${index + 1}: ${raw[index].trim()}`] : [];
  });
}

test('translated studio sources contain no Korean UI strings', () => {
  assert.deepEqual(ENGLISH_UI_SOURCES.flatMap(koreanUiLines), []);
});

test('the visible style bar and status bar in index.html are English', () => {
  const html = readFileSync(join(rootDir, 'index.html'), 'utf8');
  const start = html.indexOf('<div id="style-bar">');
  const end = html.indexOf('</footer>');
  assert.ok(start > 0 && end > start, 'style bar / status bar markers not found in index.html');
  const offenders = html
    .slice(start, end)
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => HANGUL.test(withoutKoreanData(line)))
    .map((line) => line.trim());
  assert.deepEqual(offenders, []);
});
