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

### 1. Tab into a cell does not select what is in it (biggest one for forms)

Tabbing into a cell that already has text leaves a caret at the **start** of that text and selects
nothing (measured: 0 `.selection-highlight` elements). Word and HWP both select the cell's contents,
so typing replaces them.

Why it matters: on a form, half the cells contain a printed label. Tab into one, type, and the entry
is glued to the label instead of replacing it. Walking the form by Tab, I typed the reason paragraph
into the "3. 초청사유" heading cell and got `친구 초청으로 …사이입니다.3. 초청사유` in one cell — no
warning, and it looks plausible until read closely.

### 2. Double-click does not select a word; triple-click does not select a line

Both leave the selection empty; only click-drag selects. `selectWord` (or any equivalent) does not
exist anywhere in the sources, so this is a missing upstream feature, not a regression.

Why it matters: correcting a value someone already typed is the most common form edit there is, and
double-click is how everyone does it. Today it takes a careful drag across small cell text.

### 3. Nothing shows the document has unsaved changes

The title stays `<file> - HWP Word` after any amount of editing, and the Save button is enabled even
in a freshly opened, untouched document, so neither tells you whether your work is saved. The only
safety net is the Electron dialog on close ("This document has unsaved changes."), which is real but
arrives at the last moment.

### 4. Saving says nothing

Ctrl+S writes the file with no toast, no status-bar message and no title change; the only visible
difference is that the load-time text in the status bar disappears. After a long form, the user has
no confirmation their work reached disk.

### 5. The status bar shows developer telemetry

It reads `<file> — 1 pages (129.0ms)`: the render time in milliseconds, in the user's status bar,
and it stays there until the next save. Word uses that space for page and word counts.

## Not findings (checked and dismissed)

- **"The app opens on the Layout tab."** The ribbon persists the last tab in `localStorage`; the
  Layout I kept seeing was left there by this session's own automation. The default is Home.
- **"Clicking a cell puts the caret in the wrong cell."** An artifact of automation clicking fixed
  coordinates after a row had grown. Clicking is accurate in a stable layout.
- **The `영문 (    )` cell wrapping the `(` onto its own line.** Narrow-cell wrapping of the form's
  own text, which HWP does too.
