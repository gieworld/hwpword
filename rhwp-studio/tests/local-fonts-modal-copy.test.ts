import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function source(path: string): string {
  return readFileSync(join(rootDir, path), 'utf8');
}

test('로컬 글꼴 감지 모달은 사용자에게 대체 글꼴 표현을 사용한다', () => {
  const modal = source('src/ui/local-fonts-modal.ts');

  assert.match(modal, /View with Substitute Fonts/);
  assert.match(modal, /Using substitute font/);
  assert.doesNotMatch(modal, /View with Web Substitute/);
  assert.doesNotMatch(modal, /Using web substitute/);
});

test('외부 웹폰트 비활성 상태는 로컬 글꼴 감지 모달에 표시된다', () => {
  const modal = source('src/ui/local-fonts-modal.ts');

  assert.match(modal, /External web fonts disabled: on/);
  assert.match(modal, /instead of requesting external CDN fonts/);
});

test('문서 열기는 로컬 글꼴 감지 모달을 자동으로 띄우지 않는다', () => {
  const main = source('src/main.ts');

  assert.doesNotMatch(main, /showLocalFontsModalIfNeeded/);
});
