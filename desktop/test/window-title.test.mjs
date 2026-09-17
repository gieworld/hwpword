import test from 'node:test';
import assert from 'node:assert/strict';
import { isAppTitle } from '../lib/window-title.mjs';

test('the studio own document titles pass', () => {
  assert.equal(isAppTitle('launch-test.hwp - HWP Word'), true);
  assert.equal(isAppTitle('New Document.hwp - HWP Word'), true);
});

test('a title without the studio suffix is rejected, including the print job\'s temporary title', () => {
  assert.equal(isAppTitle('launch-test'), false);
  assert.equal(isAppTitle('HWP Word'), false);
  assert.equal(isAppTitle(''), false);
});

test('a bare suffix with no document name is rejected', () => {
  assert.equal(isAppTitle(' - HWP Word'), false);
});

test('non-string titles are rejected rather than throwing', () => {
  assert.equal(isAppTitle(undefined), false);
  assert.equal(isAppTitle(null), false);
});
