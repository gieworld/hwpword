# HWP Word Pure-English Follow-up Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Nothing the HWP Word app itself shows contains Korean. There are exactly two exceptions: the user's document content, and Hancom's licence sentence in About, which gets an English translation beneath it. This plan also fixes the known issues left over from the MVP.

**Architecture:**
1. **Exhaustive guard.** The English guard test scans every studio source file except an explicit list of non-UI modules. A shrinking pending list keeps the suite green while translation batches land.
2. **Display names.** A display-name layer shows English (or romanized) names for Korean font and style names without changing document values.
3. **Engine messages.** Messages from the engine (Rust/WASM, not modified) are translated at every message sink, falling back to generic English.
4. **Translation and fixes.** Remaining UI strings are translated in batches, then the known issues are fixed.
5. **Verification script.** A committed script drives the app over CDP and fails if any visible DOM text contains Hangul.

**Tech Stack:** rhwp-studio (TypeScript 7, Vite 8, `node --test`), Electron 44, puppeteer-core (already in `rhwp-studio/node_modules`).

**Context:** Continues `docs/superpowers/plans/2026-09-16-hwpword-desktop-mvp.md` on branch `mvp`. Approved in chat on 2026-09-17. The user's decisions:
- About keeps the Korean licence sentence and adds an English translation beneath it.
- Font and style names show a known English name; anything else is romanized.

## Global Constraints

- **Shell and location:** Git Bash, from `D:\Projects\hwpword`. Node 22.23.2.
- **Commit trailer:** every commit message ends with the trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Pass it as a second `-m`.
- **What may change in translations:** visible text only.
  - Never change option or radio `value`s, data keys, command IDs, or strings that are compared, parsed, used as keys, or sent to the WASM engine.
  - Those stay Korean with a trailing comment `// hwpword-keep-korean` plus a short reason.
- **Copy rules** (`docs/hwpword/glossary.md`):
  - Title Case for buttons, menus, tabs and dialog titles; sentence case for labels and messages.
  - No Hancom mnemonics such as `(S)` in any visible text.
  - Dialog-opening commands end with `…`.
- **What stays Korean:** font family *values* and the document's own style *values* (the display-name layer changes only what is shown), and the hidden `#menu-bar` / `#icon-toolbar` markup in `index.html`, which is never visible.
- **Studio suite:** `(cd rhwp-studio && npm test > ../corpus/studio-test.tap 2>&1); grep -E "^not ok " corpus/studio-test.tap`. The `not ok` test names must equal `docs/hwpword/windows-test-baseline.md`; numbering drifts. `cd rhwp-studio && npx tsc --noEmit` must be clean.
- **Desktop suite:** `npm --prefix desktop test` must pass.
- **Upstream tests:** update an upstream test only where it pins a string you translated.
- **App verification:** follows the CDP method used so far. Build with `npm --prefix desktop run build:studio`. Launch with `npm --prefix desktop start -- --remote-debugging-port=9223 ../corpus/spike/launch-test.hwp` in the background. Drive the app with puppeteer-core from `rhwp-studio`. Throwaway scripts go in the session scratchpad. Stop only our processes by path.
- **Personal files:** never commit `corpus/`. Never delete files outside the repo.

## Non-UI modules (excluded from the guard)

- `src/core/generated/`: font rule data (Korean font names are data)
- `src/core/hwp-constants.ts`: HwpCtrl API constant names
- `src/hwpctl/`: HwpCtrl compatibility API
- `src/document-agent/`: not exposed in the desktop app
- `src/automation/`: external automation API
- `src/embed/`: embed runtime, unused in the desktop app
- `src/plugin/`: plugin host, unused in the desktop build
- `src/core/rhwp-dev.ts`, `src/core/subsecond-runtime.ts`: developer tooling

A reviewer must be able to confirm that none of these reaches a visible sink (DOM text, toast, alert, status bar). If one does, move that file out of the exclusion list and translate it.

---

### Task 1: Exhaustive English guard with a pending list

**Files:** Modify `rhwp-studio/tests/hwpword-english-ui.test.ts`.

- [ ] **Step 1: Replace the curated list with an exhaustive scan.**
  - Replace `ENGLISH_UI_SOURCES` and its test with:
    - `NON_UI_SOURCES`: the prefixes above.
    - `PENDING_TRANSLATION`: a sorted array of every `src/**/*.ts` file that currently has at least one Korean UI line under the existing `koreanUiLines` rules and is not excluded.
    - `allStudioSources()`: walks `src` recursively and returns posix-relative `src/...` paths of `.ts` files.
  - Keep `KOREAN_DATA`, `KEEP_MARKER`, `koreanUiLines`, and the index.html test unchanged.
  - Tests:

```ts
test('every studio UI source outside the pending list is English', () => {
  const pending = new Set(PENDING_TRANSLATION);
  const files = allStudioSources().filter(
    (file) => !NON_UI_SOURCES.some((prefix) => file.startsWith(prefix)) && !pending.has(file),
  );
  assert.deepEqual(files.flatMap(koreanUiLines), []);
});

test('the pending translation list only names files that still contain Korean UI text', () => {
  assert.deepEqual(PENDING_TRANSLATION.filter((file) => koreanUiLines(file).length === 0), []);
});
```

- [ ] **Step 2: Build the pending list.**
  - Generate `PENDING_TRANSLATION` with a throwaway script that reuses the same rules, and paste it in.
  - Check: both tests pass. Deleting a random entry from the list makes the first test fail.
  - Record the count of pending files and lines in the report.
- [ ] **Step 3: Verify the exclusions.** For each entry in `NON_UI_SOURCES`, grep for sinks (`showToast(`, `alert(`, `textContent =`, `innerText =`, `createTextNode(`, `title =`, `label:`). List any that reach visible UI in the desktop app, and move those out of the exclusion list into the pending list.
- [ ] **Step 4: Run and commit.** Run the studio suite and tsc, then commit: `Guard every studio UI source for Korean text`.

### Task 2: Display names for Korean font and style names

**Files:**
- Create `rhwp-studio/src/ui/display-names.ts` and `rhwp-studio/tests/hwpword-display-names.test.ts`.
- Modify every place that renders a font or style name as visible text: the toolbar font and style dropdowns (`src/ui/toolbar.ts`), the font selects in the character dialog (`src/ui/char-shape-dialog.ts`), the style dialog and style edit lists (`src/ui/style-dialog.ts`, `src/ui/style-edit-dialog.ts`), font set and local font dialogs if they list names, and anything else found by grep.

- [ ] **Step 1: Write the test first.**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { fontDisplayName, romanizeHangul, romanizeName, styleDisplayName } from '../src/ui/display-names.ts';

test('romanizes Hangul syllables with Revised Romanization letters', () => {
  assert.equal(romanizeHangul('한글'), 'hangeul');
  assert.equal(romanizeName('휴먼명조'), 'Hyumeonmyeongjo');
  assert.equal(romanizeName('신명 견고딕'), 'Sinmyeong Gyeongodik');
  assert.equal(romanizeName('HY헤드라인M'), 'HYhedeurainM');
  assert.equal(romanizeName('문화쓰기'), 'Munhwasseugi');
});

test('known fonts get English names, unknown Korean fonts are romanized, others pass through', () => {
  assert.equal(fontDisplayName('함초롬바탕'), 'HCR Batang');
  assert.equal(fontDisplayName('맑은 고딕'), 'Malgun Gothic');
  assert.equal(fontDisplayName('문화쓰기'), 'Munhwasseugi');
  assert.equal(fontDisplayName('Arial'), 'Arial');
});

test('built-in style names get English names, others are romanized', () => {
  assert.equal(styleDisplayName('바탕글'), 'Normal');
  assert.equal(styleDisplayName('개요 3'), 'Outline 3');
  assert.equal(styleDisplayName('차례 2'), 'TOC 2');
  assert.equal(styleDisplayName('쪽 번호'), 'Page Number');
  assert.equal(styleDisplayName('제목'), 'Jemok');
  assert.equal(styleDisplayName('Heading 1'), 'Heading 1');
});

test('display names never contain Hangul', () => {
  for (const name of ['함초롬돋움', '새굴림', '양재튼튼체B', '가나다 라마', 'ㄱㄴㄷ']) {
    assert.doesNotMatch(fontDisplayName(name), /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/, name);
    assert.doesNotMatch(styleDisplayName(name), /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/, name);
  }
});
```

- [ ] **Step 2: Implement `display-names.ts`.** It has no imports, so `node --test` can load it.

```ts
/**
 * English display names for Korean font and style names. Only visible text changes; documents keep their real
 * names. Known names come from the tables below; anything else is romanized (Revised Romanization letters, no
 * sound-change rules).
 */
const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;
const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const MEDIALS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const FINALS = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
const JAMO: Record<string, string> = {
  'ㄱ': 'g', 'ㄲ': 'kk', 'ㄳ': 'ks', 'ㄴ': 'n', 'ㄵ': 'nj', 'ㄶ': 'nh', 'ㄷ': 'd', 'ㄸ': 'tt', 'ㄹ': 'r', 'ㄺ': 'lg', 'ㄻ': 'lm',
  'ㄼ': 'lb', 'ㄽ': 'ls', 'ㄾ': 'lt', 'ㄿ': 'lp', 'ㅀ': 'lh', 'ㅁ': 'm', 'ㅂ': 'b', 'ㅃ': 'pp', 'ㅄ': 'bs', 'ㅅ': 's', 'ㅆ': 'ss',
  'ㅇ': 'ng', 'ㅈ': 'j', 'ㅉ': 'jj', 'ㅊ': 'ch', 'ㅋ': 'k', 'ㅌ': 't', 'ㅍ': 'p', 'ㅎ': 'h', 'ㅏ': 'a', 'ㅐ': 'ae', 'ㅑ': 'ya',
  'ㅒ': 'yae', 'ㅓ': 'eo', 'ㅔ': 'e', 'ㅕ': 'yeo', 'ㅖ': 'ye', 'ㅗ': 'o', 'ㅘ': 'wa', 'ㅙ': 'wae', 'ㅚ': 'oe', 'ㅛ': 'yo',
  'ㅜ': 'u', 'ㅝ': 'wo', 'ㅞ': 'we', 'ㅟ': 'wi', 'ㅠ': 'yu', 'ㅡ': 'eu', 'ㅢ': 'ui', 'ㅣ': 'i',
};

export function romanizeHangul(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xac00 && code <= 0xd7a3) {
      const index = code - 0xac00;
      out += INITIALS[Math.floor(index / 588)] + MEDIALS[Math.floor(index / 28) % 21] + FINALS[index % 28];
    } else if (HANGUL.test(ch)) {
      out += JAMO[ch] ?? '';
    } else {
      out += ch;
    }
  }
  return out;
}

/** Romanizes each whitespace-separated word that contains Hangul and capitalizes it. */
export function romanizeName(name: string): string {
  return name
    .split(/(\s+)/)
    .map((word) => {
      if (!HANGUL.test(word)) return word;
      const latin = romanizeHangul(word);
      return latin.charAt(0).toUpperCase() + latin.slice(1);
    })
    .join('');
}

const FONT_NAMES: Record<string, string> = {
  '함초롬바탕': 'HCR Batang', '함초롬돋움': 'HCR Dotum', '한컴바탕': 'Hancom Batang', '한컴돋움': 'Hancom Dotum',
  '맑은 고딕': 'Malgun Gothic', '나눔고딕': 'NanumGothic', '나눔명조': 'NanumMyeongjo', '나눔바른고딕': 'NanumBarunGothic',
  '나눔스퀘어': 'NanumSquare', '바탕': 'Batang', '바탕체': 'BatangChe', '돋움': 'Dotum', '돋움체': 'DotumChe', '굴림': 'Gulim',
  '굴림체': 'GulimChe', '궁서': 'Gungsuh', '궁서체': 'GungsuhChe', '새굴림': 'New Gulim', '휴먼명조': 'Human Myeongjo',
  '휴먼고딕': 'Human Gothic', '신명조': 'Shin Myeongjo', '중고딕': 'Jung Gothic', '견고딕': 'Gyeon Gothic',
  '한양신명조': 'Hanyang Shin Myeongjo', '한양중고딕': 'Hanyang Jung Gothic', 'HY헤드라인M': 'HY HeadLine M',
  'HY견고딕': 'HY Gyeon Gothic', 'HY신명조': 'HY Shin Myeongjo', 'HY그래픽': 'HY Graphic', '본고딕': 'Source Han Sans',
  '본명조': 'Source Han Serif', '노토 산스 KR': 'Noto Sans KR', '고운바탕': 'Gowun Batang', '고운돋움': 'Gowun Dodum',
};

const STYLE_NAMES: Record<string, string> = {
  '바탕글': 'Normal', '본문': 'Body', '쪽 번호': 'Page Number', '머리말': 'Header', '꼬리말': 'Footer', '각주': 'Footnote',
  '미주': 'Endnote', '메모': 'Memo', '차례 제목': 'TOC Heading', '캡션': 'Caption', '개요': 'Outline',
};

export function fontDisplayName(name: string): string {
  return FONT_NAMES[name] ?? (HANGUL.test(name) ? romanizeName(name) : name);
}

export function styleDisplayName(name: string): string {
  const numbered = /^(개요|차례)\s*(\d+)$/.exec(name);
  if (numbered) return `${numbered[1] === '개요' ? 'Outline' : 'TOC'} ${numbered[2]}`;
  return STYLE_NAMES[name] ?? (HANGUL.test(name) ? romanizeName(name) : name);
}
```

- [ ] **Step 3: Apply the display names.** Wherever a font or style name becomes visible text (`option.textContent`, list item text, labels), use `fontDisplayName` / `styleDisplayName`.
  - Keep the value as the real name: `option.value` stays the Korean name. Any lookup by visible text must switch to lookup by value.
  - Add `src/ui/display-names.ts` to the guard's `KOREAN_DATA` handling: its name tables are data, so mark each table line with `// hwpword-keep-korean` or restructure so the guard passes.
  - Remove any toolbar or dialog files from `PENDING_TRANSLATION` only if they no longer contain Korean UI lines.
- [ ] **Step 4: Verify in the app via CDP.**
  - Open `corpus/spike/launch-test.hwp`.
  - The font dropdown's `select.options` texts contain no Hangul, while the selected font value still matches the document's font.
  - Choosing a font from the dropdown still applies it: click-drag select text, choose "Malgun Gothic", confirm via `#font-name` value and a screenshot.
  - The style dropdown shows "Normal", and the Styles dialog shows English or romanized names.
- [ ] **Step 5: Run and commit.** Run the suites, then commit: `Show English or romanized names for Korean fonts and styles`.

### Task 3: English messages from the engine

**Files:**
- Create `rhwp-studio/src/core/engine-messages.ts` and `rhwp-studio/tests/hwpword-engine-messages.test.ts`.
- Modify the message sinks: `src/ui/toast.ts` (`showToast`), a one-time `window.alert` wrapper installed at the top of `src/main.ts` next to the desktop launch-queue hook, `showLoadError` / `showLoadErrorUnlessCancelled` in `src/main.ts`, `reportSaveError` in `src/command/commands/file.ts`, status-bar message setters, and any dialog that renders `error.message` / `String(error)`. Find these with grep.

- [ ] **Step 1: Collect the engine's user-facing messages.**
  - Sources:
    - `src/error.rs` `Display`: `유효하지 않은 파일: {}`, `페이지 {}을(를) 찾을 수 없습니다`, `렌더링 오류: {}`, `필드 오류: {}`
    - the `ParseError` `Display` and hints in `src/parser/`
    - password, encryption and distribution-document errors returned from `src/wasm_api.rs` / `src/wasm_api/`
  - Build a table of `[RegExp, replacement]` pairs, in order, that turns these into English. Keep error codes such as `UNSUPPORTED_HWP3` and numbers.
- [ ] **Step 2: Write the test first.**
  - Examples from the Rust sources:
    - `유효하지 않은 파일: 지원하지 않는 포맷입니다: HWP 3.0. 다시 저장해주세요.` → an English sentence containing `HWP 3.0` and no Hangul.
    - `페이지 5을(를) 찾을 수 없습니다` → `Page 5 was not found`.
  - An unknown Korean message → `The document engine reported an error.`, plus ` (CODE)` when the raw text contains an `[A-Z][A-Z0-9_]{2,}` code.
  - An English message → unchanged.
  - Property: no output ever contains Hangul.
- [ ] **Step 3: Implement.**
  - `export function toEnglishMessage(raw: string): string` applies the table. If Hangul remains, it returns the generic sentence with the code.
  - Wire it into every sink listed above so text is translated right before display.
  - Log the original raw text with `console.warn('[engine-message]', raw)` when the fallback is used.
- [ ] **Step 4: Verify in the app via CDP.**
  - Open `corpus/smoke/broken.hwp` (or create a text file named `.hwp`) through the launch path. The error shown (toast, alert or status bar) is English; capture alerts with `page.on('dialog')`.
- [ ] **Step 5: Run and commit.** Run the suites, then commit: `Translate engine messages before they reach the screen`.

### Task 4: Translate dialogs, batch A

**Files:**
- `src/ui/picture-props-dialog.ts`, `src/ui/cell-border-bg-dialog.ts`, `src/ui/page-border-dialog.ts`, `src/ui/equation-props-dialog.ts`, `src/ui/equation-editor-dialog.ts`, `src/ui/symbols-dialog.ts`, `src/ui/formula-dialog.ts`, `src/ui/options-dialog.ts`
- Plus any helper files these dialogs import that the pending list names.
- Upstream tests pinning changed strings.

- [ ] **Step 1: Translate.** Translate every Korean UI line in these files using the glossary. Remove each file from `PENDING_TRANSLATION` when done; the guard proves it.
- [ ] **Step 2: Handle the symbols dialog.** Symbol *characters* themselves (Hangul jamo or syllable tables that the user inserts) are content, not UI. Mark those lines `// hwpword-keep-korean` with a reason. Their category names are UI and get translated.
- [ ] **Step 3: Verify in the app via CDP.** Open each dialog via its ribbon or context-menu command. Screenshot every tab, and assert that the dialog's `innerText` contains no Hangul.
- [ ] **Step 4: Run and commit.** Run the suites, then commit: `Translate picture, border, equation, symbol, formula and options dialogs`.

### Task 5: Translate dialogs, batch B

**Files:**
- Every remaining `src/ui/**` file in `PENDING_TRANSLATION` except `compare-dialog.ts`, `compare-result-window.ts`, `history-dialog.ts`. Expected: endnote-shape, chart-data, bookmark, grid-settings, section-settings, numbering, zoom, local-fonts-modal, table-row-column, field-insert, field-edit, shape-picker, cell-split, skin-onboarding, column-settings, new-number, font-set, hml-import-warning-message and similar; the pending list is authoritative.
- Upstream tests pinning changed strings.

- [ ] **Step 1: Translate** as in Task 4, removing each file from the pending list.
- [ ] **Step 2: Verify in the app via CDP** for every dialog reachable from the ribbon, the File page, the context menu or the command palette.
- [ ] **Step 3: Run and commit.** Run the suites, then commit: `Translate the remaining editor dialogs`.

### Task 6: Translate Review features (Compare Documents, Version History)

**Files:**
- `src/compare/**` (the diff engine's report text is UI)
- `src/ui/compare-dialog.ts`, `src/ui/compare-result-window.ts`, `src/ui/history-dialog.ts`
- Upstream tests pinning changed strings

- [ ] **Step 1: Translate** as in Task 4.
  - Date formatting uses `toLocaleString('en-US')` instead of `'ko-KR'`.
  - The diff *content* shown from the documents stays as is; labels and summaries are translated.
- [ ] **Step 2: Verify in the app via CDP.**
  - **Review → Compare…:** compare `corpus/spike/launch-test.hwp` against a copy with one edited paragraph (make the copy via the launch path and Ctrl+S). The result window chrome and summaries contain no Hangul outside the documents' own text. Say how you separated the two.
  - **Review → Version History…:** English.
- [ ] **Step 3: Run and commit.** Run the suites, then commit: `Translate document compare and version history`.

### Task 7: Translate remaining core, engine, view and command modules

**Files:** every remaining file in `PENDING_TRANSLATION`. Expected:
- `src/core/wasm-bridge.ts`
- `src/engine/input-handler-keyboard.ts` and other `src/engine/**`
- `src/view/**`
- `src/core/font-loader.ts`, `numbering-defaults.ts`, `paper-defaults.ts`
- `src/command/shortcut-map.ts`, `print-surface.ts`, `engine/command.ts`
- `src/recovery/recovery-format.ts`, `src/recent/**`, `src/history/**`
- Upstream tests pinning changed strings

- [ ] **Step 1: Translate** as in Task 4, with these specifics:
  - **`wasm-bridge.ts`:** the new-document name `'새 문서.hwp'` becomes `'New Document.hwp'` everywhere it is set *and* compared (lines ~461 and ~524). Thrown error messages are translated.
  - **`input-handler-keyboard.ts`:** IME key tables (keys such as `ㅠ`) are data; mark them. Toasts are translated. The clipboard marker `[그림]` stays with its existing marker.
  - **`recovery-format.ts`:** dates use `'en-US'`.
  - **Numbering format names** shown in dropdowns are UI; values stay unchanged.
- [ ] **Step 2: Close out the pending list.** `PENDING_TRANSLATION` must end empty. Replace the second guard test with `assert.deepEqual(PENDING_TRANSLATION, [])`, or delete the constant and the pending logic.
- [ ] **Step 3: Verify in the app via CDP:**
  - a new blank document shows `New Document.hwp` in the status bar
  - the recovery prompt shows English dates (trigger it by force-stopping a dirty window, then relaunch)
  - zoom, page indicator and ruler texts are English
- [ ] **Step 4: Run and commit.** Run the suites, then commit: `Translate remaining core, engine and view messages`.

### Task 8: Fix the remaining known issues

**Files:**
- `desktop/main.mjs`, `desktop/preload.cjs`
- `rhwp-studio/src/desktop/desktop-launch-queue.ts`
- `rhwp-studio/src/engine/input-handler.ts` (`performPaste`)
- `rhwp-studio/src/ui/ribbon.ts`, `rhwp-studio/src/ui/ribbon-data.ts`, `rhwp-studio/src/styles/hwpword.css`
- `rhwp-studio/src/ui/command-palette.ts`
- `rhwp-studio/src/ui/about-dialog.ts`
- `rhwp-studio/src/main.ts` (window title)
- Mnemonic cleanup across studio UI sources
- Tests: `desktop/test/*.test.mjs`, `rhwp-studio/tests/hwpword-*.test.ts`

- [ ] **Step 1: Paste works from the ribbon and the context menu.** Tests first.
  - Add `paste(): Promise<void>` to `DesktopFileBridge` and `window.hwpwordDesktop`.
  - `preload.cjs`: `paste: () => ipcRenderer.invoke('hwpword:paste')`.
  - `main.mjs`: `ipcMain.handle('hwpword:paste', (event) => { ownerOf(event); event.sender.paste(); })`.
  - `performPaste()`: when `isHwpWordDesktop()`, call the bridge's `paste()` and return `true` instead of `document.execCommand('paste')`.
  - Update fake bridges in the existing tests, and add a source-guard test for `performPaste`.
  - CDP check: copy a word with Ctrl+C, move the caret, click `[data-ribbon-cmd="edit:paste"]`; the word is pasted (screenshot).
- [ ] **Step 2: No Hancom mnemonics anywhere visible.**
  - Remove `(X)` single-letter mnemonics from every visible string in studio sources and the `index.html` style-bar/status-bar region. Keep `accessKey` attributes.
  - Add a guard test that fails on `/\([A-Z]\)/` inside string literals of non-excluded studio sources. Mark legitimate cases (e.g. `(C)` in a copyright line) with `// hwpword-keep-korean`-style reasoning, using a new marker `hwpword-keep-text`.
- [ ] **Step 3: Consistent label.** The Home tab's `view:para-mark` label "Show Marks" becomes "Paragraph Marks" in `ribbon-data.ts`.
- [ ] **Step 4: Command palette.** In the desktop app, hide commands starting with `view:skin-` and `view:toolbox-` (they fight the Word look or hide the ribbon's formatting bar). Test via a source guard, or by making the filter a pure exported function with a unit test.
- [ ] **Step 5: Ribbon toggle state.**
  - In `Ribbon.refreshStates()`, set `.active` and `aria-pressed` on a ribbon button when an upstream element `[data-cmd="<same id>"].active` exists (upstream already syncs `.active` for para-mark, ctrl-mark, form mode, clip, grid).
  - Add a CSS rule for `.ribbon-btn.active` (selected background + accent border).
  - CDP check: after clicking Paragraph Marks, the button shows active.
- [ ] **Step 6: Window title shows the document.**
  - The studio sets `document.title = \`${fileName} - HWP Word\`` whenever the document status refreshes (after open, save, save as, new).
  - `main.mjs` stops locking the title: in `page-title-updated`, call `preventDefault()` only when the title does not end with ` - HWP Word` (so print's temporary titles never show).
  - CDP check: the window title (`BrowserWindow` title via `document.title`) is `launch-test.hwp - HWP Word`.
- [ ] **Step 7: Recover from a renderer crash.** In `createWindow`, handle `webContents` `render-process-gone` (ignore `clean-exit`) with a native dialog:
  - message: "This window stopped working."
  - detail: "Reason: <reason>. Changes since the last autosave may be lost."
  - buttons: **Reload** (reload the window; launch files are re-delivered) and **Close**.
- [ ] **Step 8: About.** Keep the Korean attribution sentence, and add a line directly beneath it: "This product was developed with reference to Hancom's public HWP (.hwp) file format documentation." The guard already exempts the Korean sentence.
- [ ] **Step 9: Run and commit.** Run both suites and tsc. Commit in logical units, one per step group.

### Task 9: Visible-UI English check script, installer and reinstall

**Files:**
- Create `desktop/scripts/check-english-ui.mjs`.
- Modify `desktop/package.json` (script `check:english`).
- Modify `CLAUDE.md` (mention the script in Commands and in the upgrade steps).

- [ ] **Step 1: Write `check-english-ui.mjs`.** It is a Node script run from the repo root.
  1. Build nothing. It expects `rhwp-studio/dist` to be current.
  2. Spawn `electron .` in `desktop/` with `--remote-debugging-port=<free port>` and a sample document path (argument, default `corpus/spike/launch-test.hwp`, or the first `samples/*.hwp` copied to a temp dir if missing).
  3. Connect puppeteer-core, resolved from `rhwp-studio/node_modules` via `createRequire`.
  4. Collect visible text and check it for Hangul in these states:
     - the main window chrome (`#ribbon`, `#style-bar` including `select` option texts, `#status-bar`)
     - each ribbon tab panel
     - the File page
     - the right-click context menu in body text and inside a table (insert a 2×2 table first)
     - the command palette with an empty query
     - every dialog opened from a ribbon button whose command opens a DOM dialog, **excluding** commands that open native pickers or the print window (list them explicitly in the script)
  5. Close each dialog with Escape or its Cancel button.
  6. Print every offending state with the Hangul text found. Exit `1` if any, `0` otherwise. Always stop the Electron process it started.

  Document content (the canvas, and text inside `#scroll-container`) is not checked.
- [ ] **Step 2: Wire it up.** Add `"check:english": "node scripts/check-english-ui.mjs"`. Run `npm --prefix desktop run build:studio` and `npm --prefix desktop run check:english`; it must exit 0. Fix any offenders by translating them. Those fixes are part of this task.
- [ ] **Step 3: Build and reinstall.**
  - Run `npm --prefix desktop run dist`.
  - Check that no `HWP Word` process is running (`Get-Process 'HWP Word'`). If one is, **stop and report**; the controller asks the user to close it, and it is never force-killed.
  - Otherwise run the installer silently over the existing install: `Start-Process 'desktop\dist\HWP Word Setup 0.1.0.exe' -ArgumentList '/S' -Wait`.
  - Verify the installed app with CDP: launch `%LOCALAPPDATA%\Programs\HWP Word\HWP Word.exe --remote-debugging-port=9223 <sample>` and run the same visible-text check against it (the script may accept `--exe <path>`).
- [ ] **Step 4: Commit.** Commit the script, `package.json` and `CLAUDE.md`: `Add a visible-UI English check and rebuild the installer`.
