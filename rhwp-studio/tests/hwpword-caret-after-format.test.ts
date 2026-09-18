import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { balancedFrom, codeOnly, functionBodyFrom } from './support/source-guard.ts';

// Changing paragraph alignment (or any character format) left the blinking caret where it was:
// centering a line moved the text but the caret stayed at the old x until the next click or arrow
// key. CursorState.getRect() returns a cached rect that only CursorState.updateRect() refreshes,
// and executeOperation deliberately skips cursor.moveTo() — the usual caller of updateRect() — for
// applyCharFormat/applyParaFormat so the selection survives the format. Nothing else refreshed it,
// so updateCaret() drew the stale rect.
//
// This pins the pairing: the branch that skips moveTo for those two command types must refresh the
// caret rect itself. It is a source guard because reaching executeOperation at runtime needs the
// whole WASM engine.

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const handler = codeOnly(readFileSync(join(rootDir, 'src/engine/input-handler.ts'), 'utf8'));

/** The `case 'command': { ... }` arm of executeOperation's switch. */
function commandCase(): string {
  const body = functionBodyFrom(handler, 'executeOperation(desc: OperationDescriptor)');
  const arm = balancedFrom(body, "case 'command': {", '{');
  assert.ok(arm.length > 0, "could not find executeOperation's case 'command' arm");
  return arm;
}

test('the format-command branch still skips moveTo to keep the selection', () => {
  assert.match(
    commandCase(),
    /desc\.command\.type !== 'applyCharFormat'\s*&&\s*desc\.command\.type !== 'applyParaFormat'/,
    'the premise of this guard changed: executeOperation no longer special-cases format commands',
  );
});

test('a format command refreshes the caret rect it did not move', () => {
  const arm = commandCase();
  assert.match(
    arm,
    /cursor\.updateRect\(\)/,
    'applyCharFormat/applyParaFormat skip cursor.moveTo(), so nothing refreshes the cached caret '
      + 'rect and the caret paints at its pre-format position until the next click',
  );
  // …and the caret has to be redrawn from the refreshed rect, not just recomputed.
  const afterRefresh = arm.slice(arm.indexOf('cursor.updateRect()'));
  assert.match(afterRefresh, /this\.updateCaret\(/, 'updateRect() without a following updateCaret() changes nothing on screen');
});

test('the refresh runs after the re-render, not before it', () => {
  const arm = commandCase();
  // updateRect asks the engine where the caret is now; asking before refreshAfterOperation has
  // re-laid out the page gives back the very position we are trying to replace.
  assert.ok(
    arm.indexOf('refreshAfterOperation') < arm.indexOf('cursor.updateRect()'),
    'cursor.updateRect() must come after refreshAfterOperation(), or it reads the stale layout',
  );
});
