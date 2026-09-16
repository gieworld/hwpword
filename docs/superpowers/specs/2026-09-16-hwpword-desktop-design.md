# HWP Word Desktop — Design Spec

- **Date:** 2026-09-16
- **Status:** Approved in brainstorming, pending written-spec review
- **Supersedes (for the MVP):** the stack and roadmap in `HWP_Word_Engine_Liquid_Gold_Plan.md`

## 1. Goal and context

A personal/internal Windows desktop editor with a Microsoft Word-style English UI that opens, edits, prints and saves Korean HWP documents without Hancom Office.

**User needs** (all four in scope eventually):

1. Edit existing forms, which are often table-heavy.
2. Write new documents for Hancom users.
3. View, print, and produce PDFs.
4. Convert formats.

Most received files are **binary HWP 5.0**; HWPX is secondary.

**Constraints:**

- The fastest route to a working tool wins, so existing code is reused aggressively.
- UI language is English.
- The user has a real document corpus but no Hancom Office.
- Machine: Windows 11, Node 22, Git, MSVC 2022. No Qt, no Rust.

## 2. Decision: build on rhwp instead of the original C++/Qt plan

Research on 2026-09-16 was verified against the repos and npm packages themselves:

- **[rhwp](https://github.com/edwardkim/rhwp)** (MIT, Rust→WASM, v0.8.6, active daily) reads, lays out, edits and saves HWP5 and HWPX. It is the only open-source project doing all four.
- **`@rhwp/core@0.8.6` on npm** ships the full editing API: about 447 WASM exports, including `insertText`, `hitTest`, `getCursorRect`, `applyCharFormat`, `createTable`, `exportHwp`, `exportHwpx`, `exportHwpVerify`, and `renderPageSvg`. **No Rust toolchain is needed.**
- **rhwp-studio** is rhwp's web editor: 248 TypeScript files, about 107K lines. It is layered as `engine/` (cursor, input, IME, selection, undo), `view/` (rendering, scroll, zoom, ruler), `core/` (WASM bridge, fonts), `command/` (command registry and dispatcher), and `ui/` (menus, dialogs). It has no i18n layer, and its UI strings are Korean.
- **Rejected:**
  - `rhwp-desk` is an LLM "agent workbench", not a document editor.
  - rhwp's native C ABI (`bindings/Native`) exports only text and markdown extraction, so a Qt shell cannot link it.
- **Alternatives considered:**
  - **(B)** An own UI on `@rhwp/core` means months of re-solving cursor, IME, selection and undo.
  - **(C)** The original C++/Qt/HarfBuzz from-scratch plan means years of work, and an HWP5 writer that cannot be validated without Hancom.
  - Both are kept as fallbacks only.

**Principle deliberately dropped:** the original plan's "own internal document model independent of HWP". The model is rhwp's HWP-native model. That is acceptable for a personal tool whose files are almost all HWP. Revisit only if rhwp becomes a dead end; the MIT license means a fork keeps working regardless.

## 3. Repository and upstream strategy

- `D:\Projects\hwpword` is a git repo that becomes a **local fork of the full rhwp repo**, with rhwp as the `upstream` remote. It is not pushed to GitHub.
- **Base:** release tag **`v0.8.6`**, merged into our history (`--allow-unrelated-histories` on first merge).
- **Engine:** the rhwp-studio Vite alias `@wasm` (today `../pkg`, a local Rust build) is repointed at `node_modules/@rhwp/core`, pinned to the same version as the merged tag.
- **Files we change:**
  - `rhwp-studio/index.html`: ribbon markup and a CSS rule hiding the old menu bar and toolbar.
  - `rhwp-studio/src/ui/**`: the ribbon and English strings.
  - `rhwp-studio/src/styles/**`: the ribbon and the "word" skin.
  - The minimal theme hook for the new skin, in `src/core/theme.ts`.
  - The new `desktop/` directory.
  - Everything else upstream (Rust sources, docs, other apps) stays untouched, to keep merges clean.
- **Upgrades** happen occasionally and only on release tags:
  1. `git merge <tag>`.
  2. Bump `@rhwp/core` to the same version.
  3. Resolve conflicts, which are confined to the files above.
  4. Run the corpus check (§7) before and after.
- **Translation** is done **in place** in source strings. There is no i18n framework (English only, YAGNI). Accepted cost: occasional small merge conflicts on translated strings.
- **Legal:**
  - Keep rhwp's MIT notice.
  - The About dialog must include Hancom's required attribution: "본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다."
  - The repo does not bundle Hancom fonts.

## 4. Word-style shell (rhwp-studio `ui/` layer)

### Layout (top to bottom)

1. **Ribbon.**
   - A tab strip — File · Home · Insert · Layout · References · Review · View — with Save / Undo / Redo at its left end.
   - Below the strip, a collapsible panel of grouped buttons.
2. **Ruler and page canvas.** Unchanged rhwp-studio `view/` and `engine/`.
3. **Status bar.** The existing one, with English labels and Word styling (page X of Y, zoom controls).

### Wiring rules

- New `src/ui/ribbon.ts` (about 200 lines) plus `src/styles/ribbon.css`.
- Every ribbon button carries an **existing `data-cmd` command ID**. Clicks go through the existing `CommandDispatcher`, and enabled/disabled sync mirrors `ui/menu-bar.ts`. **The MVP adds no new commands.**
- The existing formatting bar (`#style-bar`: font, size, B/I/U, colour, highlight) is **moved into the Home tab** with its bindings intact.
- The old `#menu-bar` and `#icon-toolbar` are **hidden with CSS, not deleted**. Upstream code that queries them keeps working.
- Commands without a ribbon slot go in dropdown galleries, for example the header/footer templates, or stay reachable through the existing command palette and context menu.

### Tab contents

All entries are existing commands.

| Tab | Groups |
|---|---|
| **File** (full-screen, Word-style) | New, Open, Recent, Save, Save As (HWP/HWPX), Print, Export PDF (existing PDF-print flow), Options, About |
| **Home** | Clipboard · Font (moved style bar) · Paragraph (alignment, line spacing, indent/level, bullets/numbering) · Styles · Find / Replace / Go To |
| **Insert** | Table, Picture, Shapes, Equation, Symbol, Header/Footer (+ template gallery), Footnote/Endnote, Bookmark, Field, Breaks |
| **Layout** | Page Setup (size, orientation, margins), Columns, Page Border, Section settings |
| **References** | Footnotes/Endnotes and their shape settings |
| **Review** | Compare Documents, History (no track changes; rhwp lacks it) |
| **View** | Zoom presets and fit, paragraph marks, control codes, transparent borders, grid, light/dark |

### Look

- A new **`word` skin**, registered alongside the existing `default`, `flat` and `oldschool` skins and made the default.
- Styling: Segoe UI, an Office-blue accent, light grey chrome, and white pages on a grey background.
- Dark mode comes from the existing theme system.
- The studio's existing icons are reused.

### English coverage for the MVP

- The ribbon, the File page and the status bar.
- Every dialog the ribbon opens: character shape, paragraph shape, page setup, table/cell properties, find/replace, go to, save-as, print/PDF, password.
- Toasts and confirmation messages.
- Rarer dialogs are translated progressively. A Korean string in an uncommon dialog does not block the MVP.
- Font names such as 함초롬바탕 are data, not UI, and are never translated.

## 5. Electron desktop wrapper (`desktop/`)

- **Stack:** Electron 44.x and electron-builder. The studio is built by its existing Vite config; `desktop/` only hosts the build.
- **Loading:**
  - The build is served from a privileged custom scheme `app://` via `protocol.registerSchemesAsPrivileged` (standard, secure, supportFetchAPI) plus `protocol.handle`. `file://` is not used.
  - The handler resolves paths inside the build directory only and rejects `..` traversal.
  - `npm run dev` loads the Vite dev server instead.
- **Open / Save As:** the studio's existing File System Access API calls (`showOpenFilePicker`, `showSaveFilePicker`). Electron's session permission handler grants `fileSystem` and local-font access **only to the `app://` origin**.
- **Explorer double-click and "Open with":**
  - The studio already consumes `window.launchQueue` (`command/pwa-file-handling.ts`), with handles supporting `getFile`, `createWritable`, `queryPermission` and `requestPermission`.
  - `preload.js` provides a `launchQueue` shim of about 50 lines whose handles read and write via IPC. **Ctrl+S therefore saves back to the original file**, with no studio TypeScript changes.
  - **IPC write allowlist:** the main process writes only to paths that came from a launch argument or a native picker in that window. Any other path is refused.
- **Windows:**
  - One `BrowserWindow` per document.
  - A single-instance lock makes a second launch (`second-instance`) open the file in a new window of the running app.
- **Unsaved changes:**
  - The main process handles `webContents` `will-prevent-unload` and shows a native **Don't Save / Cancel** dialog, because Electron otherwise blocks the close silently.
  - The studio's existing IndexedDB autosave and recovery stay active.
- **Print / PDF:** the studio's existing flow (`renderPageSvg`, then `print.html`, then `window.print()`) opens the Windows print dialog. **Microsoft Print to PDF** covers PDF output.
- **Security:**
  - `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
  - The preload exposes only the launch-file bridge.
  - Navigation outside `app://` is blocked.
  - `window.open` and external links go to `shell.openExternal`.
  - Web-only and LLM features (document agent, remote-URL loading, embed runtime) are hidden in the desktop build.
- **Packaging:**
  - An NSIS per-user installer (no admin).
  - File associations for `.hwp` and `.hwpx` ("HWP Word").
  - No auto-update: upgrading means rebuilding the installer.

### Day-one spike (throwaway, before the ribbon work)

| Check | Fallback if it fails |
|---|---|
| `showOpenFilePicker` / `showSaveFilePicker` work in Electron 44 with the permission handler | IPC + `dialog.showOpenDialog` / `showSaveDialog` implementing the same handle interface |
| The launchQueue shim can hand `File` objects across `contextBridge` | Pass `Uint8Array` + name across the bridge and build the `File` in a tiny main-world script |
| `window.print()` from the studio's print page opens the system print dialog | `webContents.print()` via IPC |
| The studio builds and runs against `@rhwp/core@0.8.6` from npm instead of `../pkg` | Pin a different studio commit or tag that matches the npm release |

## 6. Error handling

- **Files that fail to open** show a clear English message with a reason: parse error, password (existing password dialog), or unsupported/distribution document. The app never crashes, and the window stays usable.
- **Saves:**
  - Before writing, run the existing export content-loss check. When it reports loss, surface the warning rather than write silently. rhwp's README confirms it already blocks lossy HML saves; confirm the HWPX and HWP behaviour during the spike.
  - A failed disk write (locked file, permissions) shows an error and keeps the document dirty.
- **Data loss:** the unsaved-changes dialog (§5) and the existing autosave recovery cover this.

## 7. Testing and validation

- **Corpus:**
  - `corpus/` is **gitignored**, so personal documents are never committed.
  - The user supplies real .hwp/.hwpx files; rhwp's bundled samples are the public baseline.
- **`npm run corpus`:** a hidden Electron window (the same Chromium and fonts as the app) runs these steps for each file:
  1. Open. Record failures, password documents and distribution documents without aborting the run.
  2. Render every page to SVG and record the page count.
  3. Export HWP, plus HWPX for .hwpx input, and **reopen the exported bytes**. Compare section count, paragraph count, full text and page count.
  4. Record `exportHwpVerify` / content-loss output and the studio's missing-font analysis.

  The output is a local `corpus/report.md` with the columns file · pages · renders OK · text equal after round-trip · page count equal · loss warnings · missing fonts. Diffing the report from before and after an upgrade is the regression gate.
- **Manual Hancom acceptance** happens at the MVP and after each upgrade, because the Viewer has no automation API.
  - **Scope:** about 10 representative files: a table-heavy form, images, headers/footers, a long document, and a distribution document.
  - **Steps:** open → edit a table cell and a paragraph → Ctrl+S → open in **Hancom Office Viewer**. Pass means no error and matching layout. Repeat once with Save As HWPX.
- **Prerequisites the user installs:** Hancom Office Viewer (free for personal use) and the 함초롬바탕/돋움 fonts, before layout is judged.
- **Code checks,** limited to our logic:
  - Every `data-cmd` in the ribbon markup exists in the command registry. This catches typos and commands renamed upstream.
  - The IPC write allowlist refuses paths that were not opened or picked.
- **Upstream tests:** run rhwp-studio's `npm test` and update tests that assert Korean labels we translated.

## 8. MVP definition of done

1. The installer works. Double-clicking a .hwp opens it in the Word-style English UI, and Ctrl+S saves in place.
2. Every corpus file opens or shows a clear reason why not. No crashes.
3. Every file that opens has identical text after a save/reopen round-trip.
4. All acceptance files (about 10) open in Hancom Office Viewer after editing without error.
5. Print to Microsoft Print to PDF produces a correct PDF.
6. The ribbon covers the Home, Insert, Layout and View basics, and the dialogs it opens are English.

## 9. Out of scope (future specs)

- DOCX import and export (likely LibreOffice headless + H2Orestart for HWP→DOCX).
- Navigation pane (the engine already has `getOutlineNavigation`).
- A one-click Export PDF using `printToPDF`.
- A Save / Don't Save / Cancel close dialog.
- Track changes, a custom title bar, auto-update, and macOS/Linux builds.
- An own document model, Qt, or a native C++ engine.

## 10. Known risks

- **Hancom may reject saved HWP files.** rhwp has documented rejections (section-count mismatch, missing records). Mitigations: the round-trip corpus check, the manual Viewer acceptance, and tracking upstream fixes.
- **Layout drift.** Layout depends on fonts and sub-pixel metrics, and page counts can drift after edits (rhwp #7114). Mitigations: install 함초롬 fonts and use the report's missing-font column.
- **Upstream moves fast** (daily commits, a young project). Mitigation: pin to tags and upgrade deliberately.
- **Translated strings conflict on merge.** Accepted in §3.

## 11. Adjustments made while planning (2026-09-16)

These were found by reading rhwp-studio at `v0.8.6`, and they override the sections above. The plan is `docs/superpowers/plans/2026-09-16-hwpword-desktop-mvp.md`.

### Repo and fork hygiene (§3)

- **Fetching upstream:** a blobless partial fetch (`--filter=blob:none`) plus a sparse checkout of `rhwp-studio npm samples scripts src tools/rhwp-subsecond docs desktop`. Upstream is about 2.5 GB, and its `mydocs/` alone holds 10K+ files.
- **Line endings:** `core.autocrlf false` in this repo, because upstream's source-guard tests expect LF.
- **Agent configs:** upstream's `.claude/`, `.mcp.json`, `CLAUDE.md` and `AGENTS.md` are removed and replaced by our own `CLAUDE.md`. Otherwise they would load into every agent session.
- **Engine wiring:** there are no edits to the Vite alias or tsconfig. `desktop/scripts/sync-core.mjs` copies `@rhwp/core` into the gitignored `pkg/` folder the studio already expects.
- **Studio build:** runs from `desktop/scripts/build-studio.mjs` with `RHWP_WITHOUT_HWPCTRL=1`, because the studio's own npm scripts use POSIX environment-variable syntax that fails on Windows.
- **Node version:** the toolchain needs Node 22 LTS ≥ 22.18 (Vite 8, and `node --test` on `.ts` files).

### Word shell (§4)

- **Word look:** the Word look is `src/styles/hwpword.css`, which always loads last. It is not a registered, selectable `word` skin, because that would have touched four upstream files for the same result.
- **Ribbon markup:** the ribbon is built from `ribbon-data.ts` and mounted in one `<div id="ribbon">`. Its buttons use `data-ribbon-cmd`, so upstream's `[data-cmd]` scanners don't bind them twice.
- **Extra groups:** the Layout tab also has Rows & Columns, Cells and Arrange groups, which matter most for table-heavy forms. The Review tab also has Form Mode.
- **Command labels:** these are translated too (Task 11), because the right-click menu on tables shows them.
- **Dialogs:** the ribbon opens the table-create and style-edit dialogs directly, so they are translated as well. Other dialogs the ribbon opens stay Korean until later.
- **English enforcement:** a guard test (`tests/hwpword-english-ui.test.ts`) enforces English in the translated files. Font names, Hancom's attribution sentence, and lines marked `hwpword-keep-korean` are allowed.

### Desktop wrapper (§5)

- **launchQueue shim:** it lives in the studio (`src/desktop/desktop-launch-queue.ts`). The preload exposes only byte-level IPC. That avoids passing `File` objects across `contextBridge`, and it makes the shim unit-testable against the studio's real `saveDocumentToFileSystem`.
- **Saving launched files:** writes are atomic (temp file, then rename).
- **Service workers:** not enabled for `app://`; no code is needed for this.
- **External web fonts:** the studio's jsdelivr-hosted 함초롬 and other fonts stay enabled for better fidelity when online.
- **Web-only and LLM features:** hidden because neither the ribbon nor the File page exposes them, and the classic menus are hidden. No extra code.
- **Packaging:** the studio build ships as `extraResources/studio`, and `@rhwp/core` is a devDependency, so it stays out of the installer.

### Testing (§7)

- **Report location:** the corpus report is written to `corpus/report-<folder>.md`.
- **Dropped check:** `exportHwpVerify` is not called, because the runner's own before/after comparison covers the same thing.
- **Missing fonts:** detected by measuring text in a canvas. `queryLocalFonts` needs a user gesture, which a hidden window never has.
- **Failed saves:** Task 4 manually checks that a failed save (read-only file) keeps the document dirty.

### Known limitation

The File page's Recent list cannot reopen files that were opened by double-click. Their handles can't be stored in IndexedDB, so the studio records them without a handle. Files opened through the Open dialog reopen normally.
