import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { balancedFrom, codeOnly, functionBodyFrom } from './support/source-guard.ts';

// Filling a real form (a Korean 초청장 with a label in half the cells) turned up three gaps that
// only bite when a document is a form. See docs/hwpword/ux-form-filling-notes.md.
//
//   - Tab moved to the next cell but left a caret at the start of whatever was already in it, so
//     typing glued the entry onto the printed label instead of replacing it. Word and HWP select.
//   - Double-click selected nothing and triple-click selected nothing; only click-drag worked.
//     There was no word-selection code in the tree at all.
//
// Reaching any of this at runtime needs the WASM engine, so these pin the wiring instead; the
// behaviour itself was verified over CDP against both the old and the new build.

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const src = (rel: string) => codeOnly(readFileSync(join(rootDir, rel), 'utf8'));

test('Tab into a table cell selects what is in it', () => {
  const keyboard = src('src/engine/input-handler-keyboard.ts');
  const tabCase = balancedFrom(keyboard, "case 'Tab': {", '{');
  assert.ok(tabCase.includes('moveToCellNext()'), 'the premise changed: Tab no longer moves between cells');
  assert.match(
    tabCase,
    /selectCellContents\(\)/,
    'Tab lands in a cell without selecting it, so typing appends to the label already there',
  );
  assert.ok(
    tabCase.indexOf('moveToCellNext()') < tabCase.indexOf('selectCellContents()'),
    'the cell has to be entered before its contents can be selected',
  );
  assert.match(tabCase, /updateSelection\(\)/, 'a selection that is never rendered is invisible to the user');
});

test('selectCellContents reports an empty cell rather than selecting nothing', () => {
  const body = functionBodyFrom(src('src/engine/cursor.ts'), 'selectCellContents()');
  assert.match(body, /return false/, 'callers need to know when there was nothing to select');
  assert.match(body, /this\.anchor = null/, 'an empty cell must also drop any previous selection');
});

test('double-click selects the word under the pointer', () => {
  const mouse = src('src/engine/input-handler-mouse.ts');
  const dbl = functionBodyFrom(mouse, 'export function onDblClick');
  assert.match(dbl, /selectWordAtCursor\(\)/, 'double-click still falls through without selecting a word');
  assert.match(dbl, /updateSelection\(\)/);
});

test('the third click of a triple-click selects the line', () => {
  const mouse = src('src/engine/input-handler-mouse.ts');
  const triple = functionBodyFrom(mouse, 'export function onTripleClick');
  // dblclick fires only for the second click, so the third arrives as a plain click with detail 3.
  assert.match(triple, /e\.detail < 3/, 'without the detail check this would fire on every single click');
  assert.match(triple, /selectLineAtCursor\(\)/);
  const handler = src('src/engine/input-handler.ts');
  assert.match(
    handler,
    /addEventListener\('click', this\.onTripleClickBound\)/,
    'onTripleClick is never called unless it is wired to the click event',
  );
  assert.match(
    handler,
    /removeEventListener\('click', this\.onTripleClickBound\)/,
    'the listener has to come off with the rest of them, or it outlives the handler',
  );
});

test('word selection stays inside the caret paragraph', () => {
  const body = functionBodyFrom(src('src/engine/cursor.ts'), 'selectWordAtCursor()');
  // moveToWordBoundary walks into the neighbouring paragraph when this one has no word left in
  // that direction; a double-click that selects across paragraphs is a bug, not a feature.
  assert.match(body, /paragraphIndex === origin\.paragraphIndex/);
  assert.match(body, /cellParaIndex === origin\.cellParaIndex/, 'cells carry their own paragraph index');
});

test('saving says so, and an edited document is marked', () => {
  const main = src('src/main.ts');
  const handler = balancedFrom(main, "eventBus.on('document-dirty-changed'", '(');
  assert.match(handler, /setWindowTitle/, 'nothing marks the document as modified');
  assert.match(handler, /showToast/, 'saving stays silent');
  assert.match(main, /SAVED_DIRTY_REASONS/, 'every clean transition would toast, including opening a file');
  const reasons = balancedFrom(main, 'const SAVED_DIRTY_REASONS = new Set(', '(');
  for (const reason of ['save', 'save-as', 'host-save']) {
    assert.ok(reasons.includes(`'${reason}'`), `${reason} is a real markClean reason and must be covered`);
  }
  assert.ok(!reasons.includes("'document-initialized'"), 'opening a document is not a save');
});

test('the status bar does not show render timings', () => {
  const main = src('src/main.ts');
  assert.ok(
    !/initializeDocument\([^)]*ms\)/s.test(main),
    'the load time belongs in the console, not in the status bar the user reads',
  );
});
