import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly, functionBodyFrom } from './support/source-guard.ts';
import { previewPageNumber } from '../src/ui/page-number-format.ts';

// The number at the bottom of a page is a `pgnp` control, not footer text: it carries its own
// format, position and decoration characters. The engine parsed, rendered and wrote it back all
// along, but nothing could change it — getControls reports `props: {}` for it. This dialog sits on
// setPageNumberPos/getPageNumberPos, added to the engine in the same change.
//
// The preview has to agree with the engine's own composition (format_page_number in
// renderer/layout/utils.rs), or the dialog promises something the page will not show.

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const src = (rel: string) => readFileSync(join(rootDir, rel), 'utf8');
/** The engine's Rust lives at the repository root, a level above the studio. */
const engineSrc = (rel: string) => readFileSync(join(dirname(rootDir), rel), 'utf8');

test('the preview composes decoration the way the engine does', () => {
  // `- 1 -`: dash, one space each side — the shape Hancom emits (renderer comment on #3048).
  assert.equal(previewPageNumber(1, 0, '', '', '-'), '- 1 -');
  assert.equal(previewPageNumber(7, 0, '', '', ''), '7');
  assert.equal(previewPageNumber(7, 0, '(', ')', ''), '(7)');
  assert.equal(previewPageNumber(4, 2, '', '', ''), 'IV', 'format 2 is upper-case Roman');
  assert.equal(previewPageNumber(4, 3, '', '', ''), 'iv', 'format 3 is lower-case Roman');
  assert.equal(previewPageNumber(2, 4, '', '', ''), 'B', 'format 4 is upper-case Latin');
  assert.equal(previewPageNumber(1, 1, '', '', ''), '①', 'format 1 is circled digits');
});

test('the preview keeps decoration outside the number', () => {
  assert.equal(previewPageNumber(9, 2, '(', ')', '-'), '- (IX) -');
});

test('the engine exposes both halves of the setting', () => {
  const wasmApi = codeOnly(engineSrc('src/wasm_api.rs'));
  assert.match(wasmApi, /js_name = getPageNumberPos/, 'the dialog cannot open on the document values without a getter');
  assert.match(wasmApi, /js_name = setPageNumberPos/);
});

test('position 0 removes the control rather than writing an invisible one', () => {
  // The renderer returns early on position 0, so a leftover control would be dead weight in the
  // file and would come back the moment someone set a position again.
  const native = codeOnly(engineSrc('src/document_core/commands/formatting.rs'));
  const body = functionBodyFrom(native, 'pub fn set_page_number_pos_native');
  assert.match(body, /let removed = position == 0/);
  assert.match(body, /controls\.remove/);
});

test('changing an existing control does not touch the paragraph character bookkeeping', () => {
  // The control character is already in PARA_TEXT; adding 8 again would corrupt the paragraph.
  const native = codeOnly(engineSrc('src/document_core/commands/formatting.rs'));
  const body = functionBodyFrom(native, 'pub fn set_page_number_pos_native');
  const update = body.slice(body.indexOf('(Some((para_idx, ctrl_idx)), false)'), body.indexOf('(None, true)'));
  assert.ok(!update.includes('char_count'), 'updating in place must not re-run the insert bookkeeping');
  const insert = body.slice(body.indexOf('(None, false)'));
  assert.match(insert, /char_count \+= 8/, 'a fresh control does need the inline-control bookkeeping');
  assert.match(insert, /control_mask \|= 1u32 << 0x0015/, 'pgnp lives in the 0x0015 control-mask bit');
});

test('the command is reachable from the ribbon', () => {
  const ribbon = codeOnly(src('src/ui/ribbon-data.ts'));
  assert.match(ribbon, /cmd: 'page:page-number-settings'/);
  const page = codeOnly(src('src/command/commands/page.ts'));
  assert.match(page, /id: 'page:page-number-settings'/);
  assert.match(page, /PageNumberDialog/);
});
