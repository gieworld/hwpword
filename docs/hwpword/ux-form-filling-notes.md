# Filling a form: UX findings

Walked a real Korean invitation form (초청장 — a 3-section table: invitee details, inviter details,
reason) end to end in the installed app on 2026-09-18: clicked into cells, typed Korean and Latin
values, moved between cells with Tab, corrected values, saved, reopened. Worked on a copy; the
original was never touched.

Everything below was measured through CDP (caret rectangles, `.selection-highlight` elements,
button state), not eyeballed.

## What works

- Every value survived **save → reopen** unchanged, Korean and Latin alike. The written file is a
  valid HWP (12,288 → 11,264 bytes; the app rewrites the container).
- **Tab moves cell to cell** in document order — through label cells too, as HWP does — and it keeps
  working as rows grow, which is what makes keyboard-only filling viable.
- Row reflow while typing is correct: a cell that wraps to three lines grows its row and pushes the
  rest of the table down without disturbing the text already entered.
- Undo/redo inside a cell behaves (chunked by typing run, not per character).
- Click-drag selection, Enter for a new line inside a cell, and long-paragraph wrapping in the
  reason cell all behave.

## Findings

All five, plus a sixth found while verifying them, were fixed on 2026-09-18 (commits `9c4e29c5`, `33d8ca35`, `a7817395`); each entry keeps the original
symptom so the next merge from upstream can be checked against it. `tests/hwpword-form-filling.test.ts`
and `tests/hwpword-window-title.test.ts` pin the fixes.

### 1. Tab into a cell does not select what is in it (biggest one for forms) — FIXED

Tabbing into a cell that already has text leaves a caret at the **start** of that text and selects
nothing (measured: 0 `.selection-highlight` elements). Word and HWP both select the cell's contents,
so typing replaces them.

Why it matters: on a form, half the cells contain a printed label. Tab into one, type, and the entry
is glued to the label instead of replacing it. Walking the form by Tab, I typed the reason paragraph
into the "3. 초청사유" heading cell and got `친구 초청으로 …사이입니다.3. 초청사유` in one cell — no
warning, and it looks plausible until read closely.

### 2. Double-click does not select a word; triple-click does not select a line — FIXED

Both leave the selection empty; only click-drag selects. `selectWord` (or any equivalent) does not
exist anywhere in the sources, so this is a missing upstream feature, not a regression.

Why it matters: correcting a value someone already typed is the most common form edit there is, and
double-click is how everyone does it. Today it takes a careful drag across small cell text.

### 3. Nothing shows the document has unsaved changes — FIXED

The title stays `<file> - HWP Word` after any amount of editing, and the Save button is enabled even
in a freshly opened, untouched document, so neither tells you whether your work is saved. The only
safety net is the Electron dialog on close ("This document has unsaved changes."), which is real but
arrives at the last moment.

### 4. Saving says nothing — FIXED

Ctrl+S writes the file with no toast, no status-bar message and no title change; the only visible
difference is that the load-time text in the status bar disappears. After a long form, the user has
no confirmation their work reached disk.

### 5. The status bar shows developer telemetry — FIXED

It reads `<file> — 1 pages (129.0ms)`: the render time in milliseconds, in the user's status bar,
and it stays there until the next save. Word uses that space for page and word counts.

### 6. Undo after replacing a selection took two presses — FIXED

Found while verifying the fixes above, and made much more reachable by them: typing over a
selection recorded two undo entries, so one Ctrl+Z left the document in a state that never
existed — the replaced text already gone, the typed text not yet there. Measured: `국  적` →
select `국` → type `Q` → `Q  적` → undo → `적` → undo again → `국  적`. Pre-existing (drag-select
and type had it too), but Tab-selects-the-cell and double-click-selects-a-word put it in the way
of ordinary form filling.

### 7. Korean IME over a selection undid in two steps — FIXED

The same defect as 6 on the IME path, and not covered by its fix. `onCompositionStart` deletes the
selection; the composed text is only recorded at `compositionend`, so the two commands are as far
apart as the user is slow — always outside the 300 ms typing-merge window. Measured in the
installed build: Tab into `성  명`, compose `성`, one Ctrl+Z, and the cell was left empty with the
label gone. The composition now marks its commit, so the merge does not have to guess from
timestamps.

Everything else about IME composition checked out: composing into an empty cell, composing over a
Tab selection, and cancelling a composition mid-way (no stray jamo left behind).

## Not findings (checked and dismissed)

- **"The app opens on the Layout tab."** The ribbon persists the last tab in `localStorage`; the
  Layout I kept seeing was left there by this session's own automation. The default is Home.
- **"Clicking a cell puts the caret in the wrong cell."** An artifact of automation clicking fixed
  coordinates after a row had grown. Clicking is accurate in a stable layout.
- **The `영문 (    )` cell wrapping the `(` onto its own line.** Narrow-cell wrapping of the form's
  own text, which HWP does too.

## How each was fixed

- **1** `CursorState.selectCellContents()`, called from the Tab branch in `input-handler-keyboard.ts`.
  It selects from the first paragraph of the cell to the end of its last one, and returns false for
  an empty cell so the caret alone remains.
- **2** `CursorState.selectWordAtCursor()` / `selectLineAtCursor()`, called from `onDblClick` and from
  a new `click` listener that only acts on `detail >= 3` (a `dblclick` event never fires for the third
  click). Both ends are clamped to the caret's own paragraph.
- **3, 4** One `document-dirty-changed` handler in `main.ts`: a bullet in the window title while the
  document is modified, and a "Saved" toast when a clean transition carries a save reason.
- **5** The load time goes to `console.info` instead of the status bar.
- **6** `DeleteSelectionCommand.mergeWith()` folds the insert it made room for into a single
  `ReplaceSelectionCommand`, guarded by the typing-merge window and an exact position match so
  paste and unrelated edits cannot be swallowed. `tests/hwpword-replace-selection-undo.test.ts`
  runs the real commands through the real history against a fake one-paragraph document.

## A measurement trap, for next time

`page.mouse.click(x, y, { clickCount: 2 })` in puppeteer-core does **not** produce a real double
click here — the resulting `click` event still arrives with `detail: 1` and no `dblclick` fires, so
any double/triple-click test built on it silently measures nothing. Drive those through CDP instead:

    const cdp = await page.target().createCDPSession();
    for (let c = 1; c <= count; c++) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: c });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: c });
    }

## What still cannot be tested from here

**Native Windows dialogs — Open, Save As, print.** Not automatable from this setup, for two
reasons found while trying:

1. The pickers are the File System Access API (`showSaveFilePicker` / `showOpenFilePicker`), which
   Chromium only opens on a real user gesture. A synthetic `mousedown` on the ribbon button — what
   `check:english` and every script here dispatch — carries no user activation, so the picker
   never opens and nothing reports an error.
2. Driving the OS dialog means stealing the foreground and sending keystrokes. `AppActivate` does
   not reliably win the foreground on Windows 11, and keystrokes sent to the wrong window land in
   whatever the user has open. Not worth the risk for a test.

A full-desktop screenshot does show whether a dialog is up, but it captures whatever else the user
has on screen, so it is not a tool to reach for routinely.

The one safe signal, if it ever matters again: when a native modal is up the renderer stops
answering CDP, so a `page.evaluate` that times out means a dialog is open and one that answers
means it is not.
