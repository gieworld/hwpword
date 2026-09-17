import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHmlSaveFormatMessage } from '../src/ui/hml-save-format-message.ts';

test('HML 저장 차단 안내는 blocker path와 HWP/HWPX 대안을 표시한다', () => {
  const message = buildHmlSaveFormatMessage({
    hmlSavable: false,
    saveBlockers: [{
      code: 'UnsupportedElement',
      xmlPath: '/HWPML/BODY/SECTION/P/UNKNOWN',
      message: '지원하지 않는 HML 요소를 건너뛰었습니다: UNKNOWN',
      preserved: false,
    }],
  }, true);

  assert.match(message, /\/HWPML\/BODY\/SECTION\/P\/UNKNOWN/);
  assert.match(message, /Skipped unsupported HML element: UNKNOWN/);
  assert.match(message, /HWP or HWPX/);
});

test('exporter가 없으면 HML 저장을 권하지 않고 capability 진단을 표시한다', () => {
  const message = buildHmlSaveFormatMessage({ hmlSavable: true, saveBlockers: [] }, false);
  assert.match(message, /WASM/);
  assert.doesNotMatch(message, /preserving meaning/);
});
