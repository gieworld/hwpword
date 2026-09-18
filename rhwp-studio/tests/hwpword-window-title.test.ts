import test from 'node:test';
import assert from 'node:assert/strict';
import { documentWindowTitle } from '../src/ui/window-title.ts';
import { isAppTitle } from '../../desktop/lib/window-title.mjs';

// Nothing in the app used to say a document had unsaved changes: the title never changed and the
// Save button is enabled even in a freshly opened file. Filling a form and closing it, the only
// warning came from the Electron close dialog.

test('a modified document is marked in the title', () => {
  assert.equal(documentWindowTitle('초청장.hwp', true), '• 초청장.hwp - HWP Word'); // hwpword-keep-korean: fixture, a Korean file name
  assert.equal(documentWindowTitle('초청장.hwp', false), '초청장.hwp - HWP Word'); // hwpword-keep-korean: fixture, a Korean file name
});

test('both forms still reach the OS window', () => {
  // desktop/main.mjs drops any title that isAppTitle() rejects, so a marker that broke the suffix
  // would silently stop the title bar from updating at all.
  assert.ok(isAppTitle(documentWindowTitle('report.hwp', true)));
  assert.ok(isAppTitle(documentWindowTitle('report.hwp', false)));
});

test('the marker is a bullet, not an asterisk that could pass for part of the name', () => {
  assert.match(documentWindowTitle('a.hwp', true), /^• /);
});
