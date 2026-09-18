import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Typing over a selection was two undo entries: the delete, then the insert. One Ctrl+Z showed a
// document that never existed — the replaced text already gone, the typed text not yet there.
// Measured in the app before the fix: "국  적" → select "국" → type "Q" → "Q적" → undo → "적"
// → undo again → "국  적".
//
// DeleteSelectionCommand.mergeWith now folds the pair into one ReplaceSelectionCommand. These run
// the real commands through the real CommandHistory against a one-paragraph fake document, so they
// check the behaviour (what the text is after undo/redo), not the wiring.

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const at = (charOffset: number) => ({ sectionIndex: 0, paragraphIndex: 0, charOffset });

/** One paragraph of text plus the delete-fragment store the commands undo through. */
function fakeDocument(initial: string) {
  const doc = {
    text: initial,
    fragments: new Map<number, string>(),
    nextFragmentId: 1,
    captureDeleteRange() {
      const id = doc.nextFragmentId++;
      doc.fragments.set(id, doc.text);
      return id;
    },
    restoreDeleteFragment(id: number) {
      const saved = doc.fragments.get(id);
      if (saved === undefined) throw new Error(`no fragment ${id}`);
      doc.text = saved;
      doc.fragments.delete(id);
    },
    discardDeleteFragment(id: number) { doc.fragments.delete(id); },
    deleteRange(_s: number, _p0: number, from: number, _p1: number, to: number) {
      doc.text = doc.text.slice(0, from) + doc.text.slice(to);
    },
    replaceBodyTextLocal(_s: number, _p: number, offset: number, deleteCount: number, text: string) {
      doc.text = doc.text.slice(0, offset) + text + doc.text.slice(offset + deleteCount);
      return { documentPaginationPending: false, flowChanged: false, focusedPagePatch: undefined };
    },
    insertText(_s: number, _p: number, offset: number, text: string) {
      doc.text = doc.text.slice(0, offset) + text + doc.text.slice(offset);
    },
    deleteText(_s: number, _p: number, offset: number, count: number) {
      doc.text = doc.text.slice(0, offset) + doc.text.slice(offset + count);
    },
  };
  return doc;
}

async function load() {
  const vite = await createServer({
    root: rootDir, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
  });
  const command = await vite.ssrLoadModule('/src/engine/command.ts');
  const history = await vite.ssrLoadModule('/src/engine/history.ts');
  return { vite, ...command, ...history } as any;
}

test('typing over a selection is one undo, and undo brings the replaced text back', async () => {
  const m = await load();
  try {
    const doc = fakeDocument('국  적'); // hwpword-keep-korean: fixture, the label text from a real form
    const history = new m.CommandHistory();

    history.execute(new m.DeleteSelectionCommand(at(0), at(1)), doc);
    assert.equal(doc.text, '  적', 'the selection is gone'); // hwpword-keep-korean: fixture, remainder of the label
    history.execute(new m.InsertTextCommand(at(0), 'Q'), doc);
    assert.equal(doc.text, 'Q  적', 'and the typed character replaced it'); // hwpword-keep-korean: fixture

    assert.equal(history.canUndo(), true);
    const first = history.undo(doc);
    assert.equal(doc.text, '국  적', 'one undo restores what was replaced'); // hwpword-keep-korean: fixture
    assert.ok(first, 'undo reports where the caret goes');
    assert.equal(history.canUndo(), false, 'both halves came back in that single step');

    history.redo(doc);
    assert.equal(doc.text, 'Q  적', 'redo puts the replacement back in one step'); // hwpword-keep-korean: fixture
  } finally {
    await m.vite.close();
  }
});

test('the rest of the typing burst joins the same entry', async () => {
  const m = await load();
  try {
    const doc = fakeDocument('국  적'); // hwpword-keep-korean: fixture
    const history = new m.CommandHistory();
    history.execute(new m.DeleteSelectionCommand(at(0), at(1)), doc);
    const now = Date.now();
    history.execute(new m.InsertTextCommand(at(0), 'a', now), doc);
    history.execute(new m.InsertTextCommand(at(1), 'b', now + 10), doc);
    assert.equal(doc.text, 'ab  적'); // hwpword-keep-korean: fixture

    history.undo(doc);
    assert.equal(doc.text, '국  적', 'one undo covers the deletion and everything typed over it'); // hwpword-keep-korean: fixture
    assert.equal(history.canUndo(), false);
  } finally {
    await m.vite.close();
  }
});

test('an IME commit folds in however long the composition took', async () => {
  const m = await load();
  try {
    // Composing Hangul takes as long as the user takes: onCompositionStart deletes the selection,
    // and the commit is only recorded at compositionend. Measured in the app before this: Tab into
    // "성  명", compose "성", one Ctrl+Z — and the cell was left empty, the label gone with it.
    const doc = fakeDocument('성  명'); // hwpword-keep-korean: fixture, a label from a real form
    const history = new m.CommandHistory();
    history.execute(new m.DeleteSelectionCommand(at(0), at(4)), doc);
    const commit = new m.InsertTextCommand(at(0), '성', Date.now() + 9000); // hwpword-keep-korean: fixture
    commit.markCompositionCommit();
    // compositionend records without executing — the text is already in the document.
    doc.text = '성'; // hwpword-keep-korean: fixture
    history.recordWithoutExecute(commit, doc);

    history.undo(doc);
    assert.equal(doc.text, '성  명', 'one undo brings the replaced label back'); // hwpword-keep-korean: fixture
    assert.equal(history.canUndo(), false);
    history.redo(doc);
    assert.equal(doc.text, '성', 'redo re-applies the composed text'); // hwpword-keep-korean: fixture
  } finally {
    await m.vite.close();
  }
});

test('a composition that did not replace a selection is not marked, so it stays separate', async () => {
  const m = await load();
  try {
    const doc = fakeDocument('성  명'); // hwpword-keep-korean: fixture
    const history = new m.CommandHistory();
    history.execute(new m.DeleteSelectionCommand(at(0), at(4)), doc);
    const late = new m.InsertTextCommand(at(0), '성', Date.now() + 9000); // hwpword-keep-korean: fixture
    doc.text = '성'; // hwpword-keep-korean: fixture
    history.recordWithoutExecute(late, doc);
    history.undo(doc);
    assert.notEqual(doc.text, '성  명', 'an unmarked late insert must not fold into the deletion'); // hwpword-keep-korean: fixture
  } finally {
    await m.vite.close();
  }
});

test('an insert that is not the one this delete made room for stays separate', async () => {
  const m = await load();
  try {
    const cases: Array<{ name: string; insert: () => unknown }> = [
      {
        name: 'typed somewhere else',
        insert: () => new m.InsertTextCommand(at(3), 'Q'),
      },
      {
        name: 'typed much later',
        insert: () => new m.InsertTextCommand(at(0), 'Q', Date.now() + 5000),
      },
      {
        name: 'a newline, which is its own edit',
        insert: () => new m.InsertTextCommand(at(0), '\n'),
      },
    ];
    for (const { name, insert } of cases) {
      const doc = fakeDocument('국  적'); // hwpword-keep-korean: fixture
      const history = new m.CommandHistory();
      history.execute(new m.DeleteSelectionCommand(at(0), at(1)), doc);
      history.execute(insert(), doc);
      history.undo(doc);
      assert.notEqual(doc.text, '국  적', `${name}: must not fold into the deletion`); // hwpword-keep-korean: fixture
      history.undo(doc);
      assert.equal(doc.text, '국  적', `${name}: the deletion undoes on its own`); // hwpword-keep-korean: fixture
    }
  } finally {
    await m.vite.close();
  }
});

test('undoing a replacement does not re-select the replaced text', async () => {
  const m = await load();
  try {
    const doc = fakeDocument('국  적'); // hwpword-keep-korean: fixture
    const history = new m.CommandHistory();
    history.execute(new m.DeleteSelectionCommand(at(0), at(1)), doc);
    history.execute(new m.InsertTextCommand(at(0), 'Q'), doc);
    const entry = history.peekUndo?.() ?? (history as any).undoStack?.[0];
    if (entry) {
      // Hancom restores the range when a plain deletion is undone, but not a replacement (#3416).
      assert.equal(typeof entry.selectionBefore, 'undefined', 'a replacement must not carry a selection to restore');
      assert.equal(entry.type, 'replaceSelection');
    }
  } finally {
    await m.vite.close();
  }
});
