import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly, functionBodyFrom } from './support/source-guard.ts';

// Insert ▸ Page Number looked broken on a real document: the button is enabled everywhere, but the
// field can only go inside a header or footer, and outside one insertHfField just returned. Click,
// nothing happens, no reason given. Same for Total Pages and File Name.
//
// Changing which number the pages start from is a different command in a different tab
// (Layout ▸ Restart Page Numbers), and it works — so the guidance names it.

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const page = codeOnly(readFileSync(join(rootDir, 'src/command/commands/page.ts'), 'utf8'));

test('inserting a header/footer field outside one explains itself', () => {
  const body = functionBodyFrom(page, 'function insertHfField');
  assert.match(body, /isInHeaderFooter\(\)/, 'the premise changed: the guard is gone');
  assert.match(body, /showToast/, 'returning in silence is what made the button look broken');
  const guard = body.slice(body.indexOf('isInHeaderFooter()'), body.indexOf('const isHeader'));
  assert.match(guard, /showToast/, 'the message has to be on the path that refuses the insert');
});

test('the guidance says where to go, including for the start number', () => {
  const body = functionBodyFrom(page, 'function insertHfField');
  for (const hint of ['Header', 'Footer', 'Restart Page Numbers']) {
    assert.ok(body.includes(hint), `the message should name ${hint}`);
  }
});

test('the three fields that need a header or footer all route through it', () => {
  for (const id of ['page:insert-field-pagenum', 'page:insert-field-totalpage', 'page:insert-field-filename']) {
    const idx = page.indexOf(`id: '${id}'`);
    assert.ok(idx > 0, `${id} is missing`);
    const def = page.slice(idx, idx + 400);
    assert.match(def, /insertHfField\(/, `${id} must go through insertHfField, or it loses the guidance`);
  }
});
