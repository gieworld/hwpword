# HWP Word Desktop MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Windows desktop app ("HWP Word") that opens, edits, prints and saves `.hwp`/`.hwpx` files with an English, Word-style ribbon, built on a fork of rhwp.

**Architecture:**
- **Engine and editor:** a local git fork of rhwp pinned to tag `v0.8.6`. rhwp-studio (the TypeScript web editor) is kept as the editing and rendering engine. The WASM engine comes from npm `@rhwp/core@0.8.6`, copied into the gitignored `pkg/` folder where the studio already expects it.
- **Desktop shell:** a new `desktop/` Electron app serves the studio build over a private `app://` scheme and bridges Windows file launches into the studio's existing PWA `launchQueue` path.
- **Word UI:** a data-driven ribbon (`ribbon-data.ts` + `ribbon.ts`) dispatches the studio's existing command IDs.
- **Validation:** a hidden-window corpus runner round-trips real documents through `@rhwp/core` and writes a report.

**Tech Stack:** Node 22 LTS, rhwp-studio (TypeScript 7, Vite 8), `@rhwp/core` 0.8.6 (Rust→WASM), Electron 44.4.1, electron-builder 26.15.3, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-16-hwpword-desktop-design.md`. Read §11 of the spec, which lists the adjustments made while writing this plan.

## Global Constraints

- **Shell and location:** run every command from the repo root `D:\Projects\hwpword` in **Git Bash** unless a step says otherwise.
- **Node:** Node **22 LTS, ≥ 22.18.0**. Vite 8.2.2 needs ≥ 22.12, and `node --test tests/*.test.ts` needs built-in type stripping, which is on by default from 22.18.
- **Pinned versions:**
  - rhwp base tag `v0.8.6` (commit `f1f9c6ae58344ee9368996d3543f76b9345cf227`)
  - `@rhwp/core` `0.8.6`, `electron` `44.4.1`, `electron-builder` `26.15.3`, all exact with no `^`
- **Upstream edits:** edit upstream files **only** where a task says to. Never edit Rust `src/`, `mydocs/`, or other rhwp apps. Never translate the hidden `#menu-bar` / `#icon-toolbar` markup in `rhwp-studio/index.html`.
- **UI text and product name:**
  - UI text is English. Use `docs/hwpword/glossary.md` (created in Task 8) for HWP terms.
  - The product name is **HWP Word**.
  - Font family names stay Korean, and so does Hancom's attribution sentence, verbatim: `본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.`
- **Personal documents:** never commit anything under `corpus/`, which holds the user's personal documents.
- **Line endings:** LF. Task 1 sets `core.autocrlf false` for this repo.
- **Security:** Electron windows use `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. The renderer can read or write on-disk files only through tokens the main process issued for files Windows launched that window with.
- **Test baseline:** after Task 1, `npm --prefix rhwp-studio test` may only fail on test files listed in `docs/hwpword/windows-test-baseline.md`.
- **Commit trailer:** every commit message ends with the trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Pass it as a second `-m`.

## File Map

**New files:**

| Path | Responsibility |
|---|---|
| `CLAUDE.md` | Replaces rhwp's agent instructions with HWP Word's |
| `docs/hwpword/windows-test-baseline.md` | Studio test failures that already exist upstream on Windows |
| `docs/hwpword/glossary.md` | Korean → English HWP terminology and copy rules |
| `desktop/package.json` | Desktop app manifest, scripts, pinned engine/Electron versions |
| `desktop/scripts/sync-core.mjs` | Copies `@rhwp/core` into `pkg/` |
| `desktop/scripts/build-studio.mjs` | Builds rhwp-studio with desktop env vars (Windows-safe) |
| `desktop/lib/app-path.mjs` | Maps `app://host/path` to a file under a root; blocks traversal |
| `desktop/lib/launch-files.mjs` | Argv parsing, per-window launch-file token registry, atomic write |
| `desktop/main.mjs` | Electron main process: scheme, security, windows, IPC, single instance |
| `desktop/preload.cjs` | Exposes `window.hwpwordDesktop` (byte-level file bridge) |
| `desktop/electron-builder.yml` | NSIS installer + `.hwp`/`.hwpx` associations |
| `desktop/corpus/lib/report.mjs` | Round-trip comparison + Markdown report (pure) |
| `desktop/corpus/page/index.html`, `runner.mjs` | Hidden-window corpus runner using `@rhwp/core` |
| `desktop/corpus/run.mjs` | Electron entry for `npm run corpus` |
| `desktop/test/*.test.mjs` | Desktop unit tests |
| `rhwp-studio/src/desktop/desktop-launch-queue.ts` | `launchQueue` replacement backed by `window.hwpwordDesktop` |
| `rhwp-studio/src/ui/ribbon-data.ts` | Ribbon tabs/groups/buttons (English labels, existing command IDs) |
| `rhwp-studio/src/ui/ribbon.ts` | Renders ribbon + File page, dispatches, syncs enabled state |
| `rhwp-studio/src/styles/hwpword.css` | Word look; hides classic menu bar and icon toolbar |
| `rhwp-studio/tests/hwpword-*.test.ts` | Studio-side tests for the above |

**Modified upstream files:**
- `.gitignore`
- `rhwp-studio/index.html`: one ribbon mount line, plus English text in the visible style bar and status bar
- `rhwp-studio/src/style.css`: one import line
- `rhwp-studio/src/main.ts`: two hooks, plus English strings
- the English-string files listed in Tasks 8–11
- the upstream tests that assert strings we translated

---

# Phase A — Desktop app (Korean UI)

### Task 1: Toolchain and fork base

**Files:**
- Modify: `.gitignore` (comes from the upstream merge; append)
- Create: `CLAUDE.md` (replaces upstream's)
- Delete: `.claude/`, `.mcp.json`, `AGENTS.md` (upstream agent configs)
- Create: `docs/hwpword/windows-test-baseline.md`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - branch `mvp` containing the merge of `v0.8.6`
  - remote `upstream`, set up as a blobless partial clone
  - sparse checkout of `rhwp-studio npm samples scripts src tools/rhwp-subsecond docs desktop`
  - `rhwp-studio/node_modules` installed
  - the baseline file

- [ ] **Step 1: Upgrade Node to 22 LTS**

Run in PowerShell. The installer may show a UAC prompt, which the user must approve:
```powershell
winget install --id OpenJS.NodeJS.22 -e --accept-package-agreements --accept-source-agreements
```
If winget reports no matching package, download the latest **v22.x LTS Windows Installer (.msi, x64)** from https://nodejs.org/en/download and run it.

Open a **new** terminal, then run:
```bash
node -v
```
Expected: `v22.18.0` or a later `v22.x`. If it still prints `v22.11.0`, the old PATH is cached; close all terminals and retry.

- [ ] **Step 2: Branch and keep LF line endings**

```bash
git checkout -b mvp
git config core.autocrlf false
```
Expected: `Switched to a new branch 'mvp'`.

- [ ] **Step 3: Add upstream as a blobless partial clone and fetch the tag**

```bash
git remote add upstream https://github.com/edwardkim/rhwp.git
git config remote.upstream.promisor true
git config remote.upstream.partialclonefilter blob:none
git config remote.upstream.tagOpt --no-tags
git fetch --filter=blob:none upstream refs/tags/v0.8.6:refs/tags/v0.8.6
git rev-parse 'v0.8.6^{commit}'
```
Expected: the last command prints `f1f9c6ae58344ee9368996d3543f76b9345cf227`. The fetch takes seconds; upstream is 2.5 GB, but only commits and trees are fetched.

- [ ] **Step 4: Sparse checkout, then merge the tag**

```bash
git sparse-checkout set --cone rhwp-studio npm samples scripts src tools/rhwp-subsecond docs desktop
git merge --allow-unrelated-histories --no-edit -m "Merge rhwp v0.8.6 as upstream base" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" v0.8.6
git log --oneline -3
file rhwp-studio/src/main.ts
```
- **Expected, merge:** takes about 1–2 minutes (blobs download on demand).
- **Expected, log:** shows the merge commit, then the spec commit and `f1f9c6ae5 Merge pull request #6592 ...`.
- **Expected, `file`:** the output does **not** contain `CRLF`.

- [ ] **Step 5: Replace upstream agent configs with ours**

```bash
git rm -r -q --sparse .claude .mcp.json CLAUDE.md AGENTS.md
```
Create `CLAUDE.md`:
```markdown
# HWP Word

Personal Windows desktop editor for Korean HWP/HWPX documents with an English, Word-style UI.
It is a local fork of [rhwp](https://github.com/edwardkim/rhwp) (MIT), pinned to a release tag.

- Design: `docs/superpowers/specs/2026-09-16-hwpword-desktop-design.md`
- Plan: `docs/superpowers/plans/2026-09-16-hwpword-desktop-mvp.md`
- Translation glossary: `docs/hwpword/glossary.md`

## Layout

- `rhwp-studio/`: upstream web editor (TypeScript + Vite). We only touch `index.html` (ribbon mount +
  visible English text), `src/ui/ribbon*.ts`, `src/styles/hwpword.css`, one import in `src/style.css`,
  `src/desktop/`, two hooks in `src/main.ts`, and English strings in the files listed by
  `tests/hwpword-english-ui.test.ts`.
- `desktop/`: our Electron app (main process, preload, installer, corpus check). It owns the
  `@rhwp/core` and Electron versions.
- `pkg/`: generated copy of `@rhwp/core` (gitignored). Refresh with `npm --prefix desktop run sync-core`.
- Everything else is upstream and is not edited (Rust sources, docs, other apps). The checkout is sparse
  (`git sparse-checkout list`); `mydocs/`, most of `tools/` and other rhwp apps are not on disk.

## Commands (Node 22 LTS ≥ 22.18, Git Bash)

- Studio tests: `npm --prefix rhwp-studio test` (failures must be listed in `docs/hwpword/windows-test-baseline.md`)
- Desktop tests: `npm --prefix desktop test`
- Build studio for desktop: `npm --prefix desktop run build:studio`
- Run built app: `npm --prefix desktop start`
- Dev loop: `npm --prefix rhwp-studio run dev` in one terminal, `npm --prefix desktop run dev` in another
- Corpus round-trip check: `npm --prefix desktop run corpus` → `corpus/report-corpus.md`
- Installer: `npm --prefix desktop run dist` → `desktop/dist/`

## Rules

- Never commit anything under `corpus/` (personal documents).
- UI text is English; follow `docs/hwpword/glossary.md`. Font names and Hancom's attribution sentence stay Korean.
- Don't translate the hidden `#menu-bar` / `#icon-toolbar` markup in `rhwp-studio/index.html`.

## Upgrading rhwp

1. `git fetch --filter=blob:none upstream refs/tags/vX.Y.Z:refs/tags/vX.Y.Z`
2. `npm --prefix desktop run corpus` to keep a before-report, then `git merge vX.Y.Z`.
3. On conflicts in `.claude/`, `.mcp.json`, `AGENTS.md` or `CLAUDE.md`, keep ours (`git rm` the upstream copy / `git checkout --ours CLAUDE.md`).
4. Set `@rhwp/core` to `X.Y.Z` in `desktop/package.json`, then `npm --prefix desktop install` and `npm --prefix desktop run build:studio`.
5. Run both test suites and the corpus check; compare the reports.
```

Append to `.gitignore`:
```gitignore

# HWP Word
/corpus/
/desktop/node_modules/
/desktop/dist/
```

- [ ] **Step 6: Install studio dependencies**

```bash
npm --prefix rhwp-studio ci
```
Expected: finishes without `ERR!`. Warnings are fine.

- [ ] **Step 7: Record the Windows test baseline**

Run:
```bash
mkdir -p corpus
(cd rhwp-studio && npm test > ../corpus/studio-test-baseline.tap 2>&1)
node -v
grep -E "^# (tests|suites|pass|fail|cancelled|skipped|todo) " corpus/studio-test-baseline.tap
grep -E "^not ok " corpus/studio-test-baseline.tap
```
Create `docs/hwpword/windows-test-baseline.md`. Paste the **actual** command output where the brackets indicate:
```markdown
# rhwp-studio test baseline on Windows

Upstream tag v0.8.6, before any HWP Word changes. Node: [output of `node -v`]. Recorded: 2026-09-16.
Later tasks may not add failing test files beyond this list.

## Summary

[the `# tests` … `# todo` lines]

## Failing test files

[every `not ok …` line, or the single word None]
```

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md .gitignore docs/hwpword/windows-test-baseline.md
git commit -m "Set up HWP Word fork: agent config, ignores, Windows test baseline" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git status --short | head
```
Expected: `git status` prints nothing, because `corpus/` is ignored.

---

### Task 2: Desktop package, engine sync, studio build

**Files:**
- Create: `desktop/test/versions.test.mjs`
- Create: `desktop/package.json`, `desktop/package-lock.json` (generated)
- Create: `desktop/scripts/sync-core.mjs`
- Create: `desktop/scripts/build-studio.mjs`

**Interfaces:**
- Consumes: Task 1 checkout.
- Produces:
  - `npm --prefix desktop run sync-core`, which writes `pkg/rhwp.js`, `pkg/rhwp_bg.wasm` and the `.d.ts` files
  - `npm --prefix desktop run build:studio`, which writes `rhwp-studio/dist/index.html`
  - `npm --prefix desktop test`, which runs `desktop/test/*.test.mjs`

- [ ] **Step 1: Write the failing test**

`desktop/test/versions.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readJson = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));

test('@rhwp/core is pinned to the rhwp-studio version we merged', () => {
  const desktop = readJson('../package.json');
  const studio = readJson('../../rhwp-studio/package.json');
  assert.equal(desktop.devDependencies['@rhwp/core'], studio.version);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test desktop/test/versions.test.mjs`
Expected: FAIL with `ENOENT` (no `desktop/package.json`).

- [ ] **Step 3: Create the package and scripts**

`desktop/package.json`:
```json
{
  "name": "hwpword-desktop",
  "version": "0.1.0",
  "private": true,
  "description": "HWP Word: English Word-style desktop editor for HWP/HWPX, built on rhwp",
  "author": "gieworld",
  "license": "MIT",
  "type": "module",
  "main": "main.mjs",
  "scripts": {
    "test": "node --test test/*.test.mjs",
    "sync-core": "node scripts/sync-core.mjs",
    "build:studio": "node scripts/sync-core.mjs && node scripts/build-studio.mjs"
  },
  "devDependencies": {
    "@rhwp/core": "0.8.6"
  }
}
```

`desktop/scripts/sync-core.mjs`:
```js
// Copies the pinned @rhwp/core build into <repo>/pkg, where rhwp-studio's `@wasm` alias
// and tsconfig paths expect a local wasm-pack build. pkg/ is gitignored upstream.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = dirname(dirname(fileURLToPath(import.meta.url)));
const coreDir = join(desktopDir, 'node_modules', '@rhwp', 'core');
const pkgDir = join(desktopDir, '..', 'pkg');
const FILES = ['rhwp.js', 'rhwp.d.ts', 'rhwp_bg.wasm', 'rhwp_bg.wasm.d.ts', 'package.json'];

mkdirSync(pkgDir, { recursive: true });
for (const file of FILES) copyFileSync(join(coreDir, file), join(pkgDir, file));
const { version } = JSON.parse(readFileSync(join(coreDir, 'package.json'), 'utf8'));
console.log(`Copied @rhwp/core ${version} to ${pkgDir}`);
```

`desktop/scripts/build-studio.mjs`:
```js
// Builds rhwp-studio for the desktop app. Studio's own npm scripts use POSIX `VAR=1 cmd` syntax,
// which npm runs through cmd.exe on Windows, so the environment is set here instead.
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const studioDir = join(dirname(dirname(fileURLToPath(import.meta.url))), '..', 'rhwp-studio');
// The hwpctl (ActiveX compatibility) plugin is irrelevant on the desktop; this tree-shakes it out.
const env = { ...process.env, RHWP_WITHOUT_HWPCTRL: '1' };

execSync('npx tsc', { cwd: studioDir, env, stdio: 'inherit' });
execSync('npx vite build', { cwd: studioDir, env, stdio: 'inherit' });
```

- [ ] **Step 4: Install and run the test**

```bash
npm --prefix desktop install
npm --prefix desktop test
```
Expected: `# pass 1`, `# fail 0`.

- [ ] **Step 5: Build the studio against the npm engine**

```bash
npm --prefix desktop run build:studio
ls rhwp-studio/dist/index.html rhwp-studio/dist/assets/*.wasm
```
- **Expected, sync:** prints `Copied @rhwp/core 0.8.6 …`.
- **Expected, build:** `tsc` prints no errors, and Vite finishes with `✓ built in …`.
- **Expected, `ls`:** both paths exist.

**STOP condition:** if `tsc` reports that methods are missing on `HwpDocument` or `WasmBridge`, the npm release does not match the tag. Stop and report the errors; do not patch studio code.

- [ ] **Step 6: Studio tests still match the baseline**

```bash
(cd rhwp-studio && npm test > ../corpus/studio-test.tap 2>&1); grep -E "^not ok " corpus/studio-test.tap
```
Expected: the same `not ok` lines as `docs/hwpword/windows-test-baseline.md`.

- [ ] **Step 7: Commit**

```bash
git add desktop/package.json desktop/package-lock.json desktop/scripts desktop/test
git commit -m "Add desktop package: pin @rhwp/core, sync engine into pkg/, Windows-safe studio build" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Electron host (with spike gates)

**Files:**
- Create: `desktop/test/app-path.test.mjs`
- Create: `desktop/lib/app-path.mjs`
- Create: `desktop/main.mjs`
- Modify: `desktop/package.json` (add `electron`, `start`, `dev`)

**Interfaces:**
- Consumes: `rhwp-studio/dist` from Task 2.
- Produces:
  - `resolveAppPath(rootDir: string, requestUrl: string, host: string): string | null`
  - `desktop/main.mjs`, which Task 4 replaces wholesale
  - scripts `start` (built app) and `dev` (loads `http://127.0.0.1:7700`)

- [ ] **Step 1: Write the failing test**

`desktop/test/app-path.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { resolveAppPath } from '../lib/app-path.mjs';

const root = resolve('studio-dist-fixture');

test('maps app URLs to files inside the root', () => {
  assert.equal(resolveAppPath(root, 'app://hwpword/assets/main.js', 'hwpword'), join(root, 'assets', 'main.js'));
});

test('serves index.html for the bare origin', () => {
  assert.equal(resolveAppPath(root, 'app://hwpword/', 'hwpword'), join(root, 'index.html'));
});

test('decodes percent-encoded file names', () => {
  assert.equal(resolveAppPath(root, 'app://hwpword/fonts/%ED%95%A8.woff2', 'hwpword'), join(root, 'fonts', '함.woff2'));
});

test('refuses encoded separators that would escape the root', () => {
  assert.equal(resolveAppPath(root, 'app://hwpword/..%2f..%2fsecret.txt', 'hwpword'), null);
  assert.equal(resolveAppPath(root, 'app://hwpword/..%5c..%5csecret.txt', 'hwpword'), null);
});

test('refuses other hosts and malformed URLs', () => {
  assert.equal(resolveAppPath(root, 'app://other/index.html', 'hwpword'), null);
  assert.equal(resolveAppPath(root, 'not a url', 'hwpword'), null);
  assert.equal(resolveAppPath(root, 'app://hwpword/%E0%A4%A', 'hwpword'), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix desktop test`
Expected: FAIL with `Cannot find module …/lib/app-path.mjs`.

- [ ] **Step 3: Implement `resolveAppPath`**

`desktop/lib/app-path.mjs`:
```js
import { isAbsolute, join, relative, sep } from 'node:path';

/** Maps `app://<host>/<path>` to a file under `rootDir`; null if the host differs or the path escapes the root. */
export function resolveAppPath(rootDir, requestUrl, host) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.host !== host) return null;

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname === '' || pathname === '/') pathname = '/index.html';

  const filePath = join(rootDir, pathname);
  const rel = relative(rootDir, filePath);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return filePath;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm --prefix desktop test`
Expected: `# fail 0`.

- [ ] **Step 5: Add Electron and the main process**

```bash
npm --prefix desktop install --save-dev --save-exact electron@44.4.1
```
In `desktop/package.json`, add these two entries to `"scripts"`:
```json
    "start": "electron .",
    "dev": "electron . --dev-url=http://127.0.0.1:7700",
```

`desktop/main.mjs`:
```js
// HWP Word main process: serves the rhwp-studio build over app://hwpword and keeps the renderer locked down.
import { app, BrowserWindow, dialog, Menu, net, protocol, session, shell } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveAppPath } from './lib/app-path.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const APP_HOST = 'hwpword';
const APP_ORIGIN = `app://${APP_HOST}`;
const devUrlArg = process.argv.find((arg) => arg.startsWith('--dev-url='));
const DEV_URL = devUrlArg ? devUrlArg.slice('--dev-url='.length) : null;
const STUDIO_DIST = app.isPackaged
  ? join(process.resourcesPath, 'studio')
  : join(here, '..', 'rhwp-studio', 'dist');

// Service workers are deliberately not enabled for this scheme: no stale caches across installer upgrades.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

function isTrustedUrl(url) {
  return url.startsWith(`${APP_ORIGIN}/`) || (DEV_URL !== null && url.startsWith(DEV_URL));
}

function openExternally(url) {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function hardenSession(ses) {
  ses.setPermissionRequestHandler((webContents, _permission, callback, details) => {
    callback(isTrustedUrl(details.requestingUrl || webContents.getURL()));
  });
  ses.setPermissionCheckHandler((_webContents, _permission, requestingOrigin) => isTrustedUrl(`${requestingOrigin}/`));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'HWP Word',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.on('page-title-updated', (event) => event.preventDefault());
  // rhwp-studio registers beforeunload while the document is dirty; Electron would otherwise block the close silently.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'HWP Word',
      message: 'This document has unsaved changes.',
      detail: 'Close it without saving? Your changes will be lost.',
      buttons: ["Don't Save", 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (choice === 0) event.preventDefault();
  });
  win.once('ready-to-show', () => win.show());
  if (DEV_URL) win.webContents.openDevTools({ mode: 'detach' });
  void win.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`);
  return win;
}

app.on('web-contents-created', (_event, contents) => {
  // Print preview opens print.html in a child window; anything else leaves the app.
  contents.setWindowOpenHandler(({ url }) => {
    if (isTrustedUrl(url) || url === 'about:blank') return { action: 'allow' };
    openExternally(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (isTrustedUrl(url)) return;
    event.preventDefault();
    openExternally(url);
  });
});

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const filePath = resolveAppPath(STUDIO_DIST, request.url, APP_HOST);
    if (!filePath) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
  hardenSession(session.defaultSession);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
```

- [ ] **Step 6: Spike gate A: app loads, native Open/Save work**

```bash
mkdir -p corpus/spike
cp "$(ls samples/*.hwp | head -1)" corpus/spike/picker-test.hwp
npm --prefix desktop start
```
In the app:
1. **Expected:** the rhwp-studio UI (Korean) shows a blank document.
2. Click the menu **파일 → 열기**. **Expected:** the native Windows Open dialog appears. Pick `D:\Projects\hwpword\corpus\spike\picker-test.hwp`. **Expected:** the document renders.
3. Click into the text, type `HWP Word spike`, and press **Ctrl+S**. **Expected:** no error toast.
4. Close the window. **Expected:** no unsaved-changes dialog, because the document was saved.

Then:
```bash
ls -l --time-style=+%H:%M corpus/spike/picker-test.hwp
```
Expected: the modification time is now.

**STOP condition:** if the Open dialog never appears, or saving shows a `SecurityError` / `NotAllowedError`, stop. Report the DevTools console error; Task 3's fallback (IPC dialogs) needs a plan change. For DevTools, run `npm --prefix desktop run dev` with the studio dev server from Step 8.

- [ ] **Step 7: Spike gate B: unsaved-changes dialog and printing**

Run `npm --prefix desktop start` again and open `corpus/spike/picker-test.hwp` via **파일 → 열기**.
1. Type a character, then close the window with the ✕ button. **Expected:** a native dialog, "This document has unsaved changes." with **Don't Save / Cancel**.
   - **Cancel** keeps the window open.
   - Close again and choose **Don't Save**. The window closes.
2. Reopen the app and the file, then press **Ctrl+P**. **Expected:** a print preview window opens. Click **인쇄**. **Expected:** the Windows print dialog opens.
3. Choose **Microsoft Print to PDF** and save to `corpus/spike/print-test.pdf`. Open the PDF. **Expected:** it contains the document's pages, correctly laid out.
4. Use **파일 → PDF로 저장…**, which is `file:print-to-pdf`. **Expected:** it reaches the same Windows print dialog.

**STOP condition:** if the preview window is blank or no print dialog appears, stop and report.

- [ ] **Step 8: Dev loop works**

Terminal 1:
```bash
npm --prefix rhwp-studio run dev
```
Expected: `Local: http://127.0.0.1:7700/`.

Terminal 2:
```bash
npm --prefix desktop run dev
```
Expected: the app window plus a detached DevTools window. In the DevTools console, run `navigator.serviceWorker?.controller ?? null`. **Expected:** `null`.

Stop both processes with Ctrl+C.

- [ ] **Step 9: Commit**

```bash
git add desktop/package.json desktop/package-lock.json desktop/lib/app-path.mjs desktop/test/app-path.test.mjs desktop/main.mjs
git commit -m "Add Electron host serving rhwp-studio over app:// with locked-down renderer" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Double-click to open, Ctrl+S saves in place

**Files:**
- Create: `rhwp-studio/tests/hwpword-desktop-launch-queue.test.ts`
- Create: `rhwp-studio/src/desktop/desktop-launch-queue.ts`
- Modify: `rhwp-studio/src/main.ts` (one import + one call)
- Create: `desktop/test/launch-files.test.mjs`
- Create: `desktop/lib/launch-files.mjs`
- Create: `desktop/preload.cjs`
- Modify: `desktop/main.mjs` (full replacement below)

**Interfaces:**
- Consumes:
  - from Task 3: `resolveAppPath`
  - from the studio:
    - `FileSystemFileHandleLike` and `FileSystemWritableFileStreamLike` from `src/command/file-system-access.ts`
    - `LaunchQueueLike`, `handlePwaLaunchFiles` and `OpenDocumentBytesPayload` from `src/command/pwa-file-handling.ts`
    - `saveDocumentToFileSystem` from `file-system-access.ts`
- Produces:
  - `window.hwpwordDesktop: DesktopFileBridge` with three methods:
    - `getLaunchFiles(): Promise<Array<{ token: string; name: string }>>`
    - `readFile(token): Promise<Uint8Array>`
    - `writeFile(token, bytes: Uint8Array): Promise<void>`
  - `installDesktopLaunchQueue(win: DesktopWindowLike): boolean`
  - `launchPathsFromArgv(argv: string[], cwd?: string, exists?: (p: string) => boolean): string[]`
  - `class LaunchFileRegistry { register(ownerId, paths); list(ownerId); pathFor(ownerId, token); release(ownerId) }`
  - `writeFileAtomic(path, bytes): Promise<void>`
  - IPC channels `hwpword:get-launch-files`, `hwpword:read-file`, `hwpword:write-file`

- [ ] **Step 1: Write the failing studio test**

`rhwp-studio/tests/hwpword-desktop-launch-queue.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDesktopLaunchQueue,
  installDesktopLaunchQueue,
  type DesktopFileBridge,
} from '../src/desktop/desktop-launch-queue.ts';
import { handlePwaLaunchFiles, type OpenDocumentBytesPayload } from '../src/command/pwa-file-handling.ts';
import { saveDocumentToFileSystem, type FileSystemFileHandleLike } from '../src/command/file-system-access.ts';

function fakeBridge(files: Record<string, { name: string; bytes: Uint8Array<ArrayBuffer> }>) {
  const writes: Array<{ token: string; bytes: number[] }> = [];
  const bridge: DesktopFileBridge = {
    async getLaunchFiles() {
      return Object.entries(files).map(([token, file]) => ({ token, name: file.name }));
    },
    async readFile(token) {
      return files[token].bytes;
    },
    async writeFile(token, bytes) {
      writes.push({ token, bytes: [...bytes] });
    },
  };
  return { bridge, writes };
}

function launchedHandles(bridge: DesktopFileBridge): Promise<FileSystemFileHandleLike[]> {
  return new Promise((resolve) => {
    createDesktopLaunchQueue(bridge).setConsumer((params) => resolve(params.files ?? []));
  });
}

test('launched files open through the studio PWA launch path', async () => {
  const { bridge } = fakeBridge({ t1: { name: 'form.hwp', bytes: new Uint8Array([1, 2, 3]) } });
  const payloads: OpenDocumentBytesPayload[] = [];
  await handlePwaLaunchFiles({ files: await launchedHandles(bridge) }, {
    openDocumentBytes: (payload) => payloads.push(payload),
    notifyUnsupportedFile: (name) => assert.fail(`unsupported ${name}`),
    notifyError: (error) => assert.fail(String(error)),
  });
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].fileName, 'form.hwp');
  assert.deepEqual([...payloads[0].bytes], [1, 2, 3]);
});

test('Ctrl+S on a launched file writes the whole document back through the bridge', async () => {
  const { bridge, writes } = fakeBridge({ t1: { name: 'form.hwp', bytes: new Uint8Array([1]) } });
  const [handle] = await launchedHandles(bridge);
  const result = await saveDocumentToFileSystem({
    blob: new Blob([new Uint8Array([9, 8]), new Uint8Array([7])]),
    suggestedName: 'form.hwp',
    currentHandle: handle,
    windowLike: {},
    forceSaveAs: false,
    saveFormat: 'hwp',
  });
  assert.equal(result.method, 'current-handle');
  assert.deepEqual(writes, [{ token: 't1', bytes: [9, 8, 7] }]);
});

test('nothing launched means the consumer is never called', async () => {
  const { bridge } = fakeBridge({});
  let called = false;
  createDesktopLaunchQueue(bridge).setConsumer(() => {
    called = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(called, false);
});

test('launched handles report granted permission and identify themselves', async () => {
  const [handle] = await launchedHandles(fakeBridge({ t1: { name: 'a.hwpx', bytes: new Uint8Array() } }).bridge);
  assert.equal(await handle.queryPermission?.({ mode: 'readwrite' }), 'granted');
  assert.equal(await handle.requestPermission?.({ mode: 'readwrite' }), 'granted');
  assert.equal(await handle.isSameEntry?.(handle), true);
});

test('installs over the browser launchQueue getter, but only inside HWP Word', () => {
  const nativeQueue = { setConsumer() {} };
  class WindowBase {
    get launchQueue() {
      return nativeQueue;
    }
  }
  const browser = new WindowBase() as WindowBase & { hwpwordDesktop?: DesktopFileBridge };
  assert.equal(installDesktopLaunchQueue(browser), false);
  assert.equal(browser.launchQueue, nativeQueue);

  const desktop = Object.assign(new WindowBase(), { hwpwordDesktop: fakeBridge({}).bridge });
  assert.equal(installDesktopLaunchQueue(desktop), true);
  assert.notEqual(desktop.launchQueue, nativeQueue);
  assert.equal(typeof desktop.launchQueue.setConsumer, 'function');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd rhwp-studio && node --test tests/hwpword-desktop-launch-queue.test.ts; cd ..`
Expected: FAIL with `Cannot find module …/src/desktop/desktop-launch-queue.ts`.

- [ ] **Step 3: Implement the studio shim**

`rhwp-studio/src/desktop/desktop-launch-queue.ts`:
```ts
import type {
  FileSystemFileHandleLike,
  FileSystemWritableFileStreamLike,
} from '../command/file-system-access.ts';
import type { LaunchQueueLike } from '../command/pwa-file-handling.ts';

/** Byte-level file bridge exposed by the HWP Word Electron preload as `window.hwpwordDesktop`. */
export interface DesktopFileBridge {
  getLaunchFiles(): Promise<Array<{ token: string; name: string }>>;
  readFile(token: string): Promise<Uint8Array<ArrayBuffer>>;
  writeFile(token: string, bytes: Uint8Array): Promise<void>;
}

export interface DesktopWindowLike {
  hwpwordDesktop?: DesktopFileBridge;
}

function createDesktopFileHandle(bridge: DesktopFileBridge, token: string, name: string): FileSystemFileHandleLike {
  const handle: FileSystemFileHandleLike = {
    kind: 'file',
    name,
    async getFile() {
      return new File([await bridge.readFile(token)], name);
    },
    async createWritable(): Promise<FileSystemWritableFileStreamLike> {
      const parts: Blob[] = [];
      return {
        async write(data: Blob) {
          parts.push(data);
        },
        async close() {
          await bridge.writeFile(token, new Uint8Array(await new Blob(parts).arrayBuffer()));
        },
      };
    },
    async isSameEntry(other) {
      return other === handle;
    },
    async queryPermission() {
      return 'granted';
    },
    async requestPermission() {
      return 'granted';
    },
  };
  return handle;
}

/** A `launchQueue` that hands the files Windows launched this window with to the studio's PWA open path. */
export function createDesktopLaunchQueue(bridge: DesktopFileBridge): LaunchQueueLike {
  return {
    setConsumer(consumer) {
      bridge
        .getLaunchFiles()
        .then((files) => {
          if (files.length === 0) return;
          consumer({ files: files.map((file) => createDesktopFileHandle(bridge, file.token, file.name)) });
        })
        .catch((error) => console.error('[hwpword] could not read launch files', error));
    },
  };
}

/** Replaces `window.launchQueue` when running inside HWP Word; a normal browser keeps its own. */
export function installDesktopLaunchQueue(win: DesktopWindowLike): boolean {
  if (!win.hwpwordDesktop) return false;
  // Chromium defines launchQueue as a getter on Window.prototype, so shadow it with an own property.
  Object.defineProperty(win, 'launchQueue', {
    value: createDesktopLaunchQueue(win.hwpwordDesktop),
    configurable: true,
  });
  return true;
}
```

- [ ] **Step 4: Run the studio test**

Run: `cd rhwp-studio && node --test tests/hwpword-desktop-launch-queue.test.ts; cd ..`
Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 5: Hook the shim into `main.ts`**

In `rhwp-studio/src/main.ts`, directly **after** the line
```ts
import { installEmbedRuntime } from '@/embed/runtime';
```
add
```ts
import { installDesktopLaunchQueue, type DesktopWindowLike } from '@/desktop/desktop-launch-queue';
```
Then, directly **before** the line
```ts
initThemeSync((effective, mode) => {
```
add
```ts
// HWP Word desktop: files Windows launched us with arrive through the PWA launch-queue path below.
installDesktopLaunchQueue(window as unknown as DesktopWindowLike);

```
If either anchor line is missing, find the last `import` line and the first top-level `initThemeSync(` call, and use those instead.

- [ ] **Step 6: Write the failing desktop test**

`desktop/test/launch-files.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LaunchFileRegistry, launchPathsFromArgv, writeFileAtomic } from '../lib/launch-files.mjs';

test('picks existing document paths out of argv', () => {
  const missing = resolve('C:/docs', 'missing.hwp');
  const exists = (path) => path !== missing;
  const argv = [
    'C:/Users/me/AppData/Local/Programs/HWP Word/HWP Word.exe',
    '--allow-file-access-from-files',
    '.',
    'a.hwp',
    'B.HWPX',
    'notes.txt',
    'missing.hwp',
    'c.hml',
  ];
  assert.deepEqual(launchPathsFromArgv(argv, 'C:/docs', exists), [
    resolve('C:/docs', 'a.hwp'),
    resolve('C:/docs', 'B.HWPX'),
    resolve('C:/docs', 'c.hml'),
  ]);
});

test('tokens only resolve for the window they were issued to', () => {
  const registry = new LaunchFileRegistry();
  registry.register(1, ['C:/docs/a.hwp']);
  registry.register(2, []);
  const [file] = registry.list(1);
  assert.equal(file.name, 'a.hwp');
  assert.equal(registry.pathFor(1, file.token), 'C:/docs/a.hwp');
  assert.equal(registry.pathFor(2, file.token), null);
  assert.equal(registry.pathFor(1, 'made-up-token'), null);
  registry.release(1);
  assert.equal(registry.pathFor(1, file.token), null);
  assert.deepEqual(registry.list(1), []);
});

test('atomic write replaces the file and leaves no temp file behind', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hwpword-'));
  const target = join(dir, 'doc.hwp');
  writeFileSync(target, 'old');
  await writeFileAtomic(target, new Uint8Array([110, 101, 119]));
  assert.equal(readFileSync(target, 'utf8'), 'new');
  assert.deepEqual(readdirSync(dir), ['doc.hwp']);
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm --prefix desktop test`
Expected: FAIL with `Cannot find module …/lib/launch-files.mjs`.

- [ ] **Step 8: Implement launch files, preload and the new main process**

`desktop/lib/launch-files.mjs`:
```js
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { rename, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const DOCUMENT_EXTENSION = /\.(hwp|hwpx|hml)$/i;

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Document paths passed on the command line (Explorer double-click, "Open with", a second launch). */
export function launchPathsFromArgv(argv, cwd = process.cwd(), exists = isFile) {
  return argv
    .filter((arg) => !arg.startsWith('-') && DOCUMENT_EXTENSION.test(arg))
    .map((arg) => resolve(cwd, arg))
    .filter((path) => exists(path));
}

/**
 * Per-window allowlist of launched files. The renderer only ever sees opaque tokens, so a window
 * can read or write exactly the files it was launched with and nothing else on disk.
 */
export class LaunchFileRegistry {
  #windows = new Map();

  register(ownerId, paths) {
    this.#windows.set(ownerId, new Map(paths.map((path) => [randomUUID(), path])));
  }

  list(ownerId) {
    return [...(this.#windows.get(ownerId) ?? [])].map(([token, path]) => ({ token, name: basename(path) }));
  }

  pathFor(ownerId, token) {
    return this.#windows.get(ownerId)?.get(token) ?? null;
  }

  release(ownerId) {
    this.#windows.delete(ownerId);
  }
}

/** Temp file + rename, so a failed save never leaves a half-written document. */
export async function writeFileAtomic(path, bytes) {
  const temp = `${path}.hwpword-${process.pid}.tmp`;
  await writeFile(temp, bytes);
  try {
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
```

`desktop/preload.cjs`:
```js
// Sandboxed preload: byte-level access to the files this window was launched with, nothing more.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hwpwordDesktop', {
  getLaunchFiles: () => ipcRenderer.invoke('hwpword:get-launch-files'),
  readFile: (token) => ipcRenderer.invoke('hwpword:read-file', token),
  writeFile: (token, bytes) => ipcRenderer.invoke('hwpword:write-file', token, bytes),
});
```

Replace `desktop/main.mjs` entirely with:
```js
// HWP Word main process: serves the rhwp-studio build over app://hwpword, keeps the renderer locked down,
// and hands files Windows launched us with to the studio through token-scoped IPC.
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell } from 'electron';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveAppPath } from './lib/app-path.mjs';
import { LaunchFileRegistry, launchPathsFromArgv, writeFileAtomic } from './lib/launch-files.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const APP_HOST = 'hwpword';
const APP_ORIGIN = `app://${APP_HOST}`;
const devUrlArg = process.argv.find((arg) => arg.startsWith('--dev-url='));
const DEV_URL = devUrlArg ? devUrlArg.slice('--dev-url='.length) : null;
const STUDIO_DIST = app.isPackaged
  ? join(process.resourcesPath, 'studio')
  : join(here, '..', 'rhwp-studio', 'dist');
const launchFiles = new LaunchFileRegistry();

// Service workers are deliberately not enabled for this scheme: no stale caches across installer upgrades.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

function isTrustedUrl(url) {
  return url.startsWith(`${APP_ORIGIN}/`) || (DEV_URL !== null && url.startsWith(DEV_URL));
}

function openExternally(url) {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function hardenSession(ses) {
  ses.setPermissionRequestHandler((webContents, _permission, callback, details) => {
    callback(isTrustedUrl(details.requestingUrl || webContents.getURL()));
  });
  ses.setPermissionCheckHandler((_webContents, _permission, requestingOrigin) => isTrustedUrl(`${requestingOrigin}/`));
}

function createWindow(launchPaths = []) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'HWP Word',
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const ownerId = win.webContents.id;
  launchFiles.register(ownerId, launchPaths);
  win.on('closed', () => launchFiles.release(ownerId));
  win.on('page-title-updated', (event) => event.preventDefault());
  // rhwp-studio registers beforeunload while the document is dirty; Electron would otherwise block the close silently.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'HWP Word',
      message: 'This document has unsaved changes.',
      detail: 'Close it without saving? Your changes will be lost.',
      buttons: ["Don't Save", 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (choice === 0) event.preventDefault();
  });
  win.once('ready-to-show', () => win.show());
  if (DEV_URL) win.webContents.openDevTools({ mode: 'detach' });
  void win.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`);
  return win;
}

function openLaunchPaths(paths) {
  if (paths.length === 0) return false;
  for (const path of paths) createWindow([path]);
  return true;
}

function registerIpc() {
  const ownerOf = (event) => {
    if (!isTrustedUrl(event.senderFrame?.url ?? '')) throw new Error('Untrusted sender');
    return event.sender.id;
  };
  const pathOf = (event, token) => {
    const path = launchFiles.pathFor(ownerOf(event), token);
    if (!path) throw new Error('Unknown file token');
    return path;
  };
  ipcMain.handle('hwpword:get-launch-files', (event) => launchFiles.list(ownerOf(event)));
  ipcMain.handle('hwpword:read-file', async (event, token) => new Uint8Array(await readFile(pathOf(event, token))));
  ipcMain.handle('hwpword:write-file', async (event, token, bytes) => {
    const path = pathOf(event, token);
    if (!(bytes instanceof Uint8Array)) throw new Error('Expected document bytes');
    await writeFileAtomic(path, bytes);
  });
}

app.on('web-contents-created', (_event, contents) => {
  // Print preview opens print.html in a child window; anything else leaves the app.
  contents.setWindowOpenHandler(({ url }) => {
    if (isTrustedUrl(url) || url === 'about:blank') return { action: 'allow' };
    openExternally(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (isTrustedUrl(url)) return;
    event.preventDefault();
    openExternally(url);
  });
});

Menu.setApplicationMenu(null);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    if (openLaunchPaths(launchPathsFromArgv(argv, workingDirectory))) return;
    const [existing] = BrowserWindow.getAllWindows();
    if (!existing) {
      createWindow();
      return;
    }
    if (existing.isMinimized()) existing.restore();
    existing.focus();
  });

  app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      const filePath = resolveAppPath(STUDIO_DIST, request.url, APP_HOST);
      if (!filePath) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(filePath).toString());
    });
    hardenSession(session.defaultSession);
    registerIpc();
    if (!openLaunchPaths(launchPathsFromArgv(process.argv))) createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
```

- [ ] **Step 9: Run all tests**

```bash
npm --prefix desktop test
(cd rhwp-studio && npm test > ../corpus/studio-test.tap 2>&1); grep -E "^not ok " corpus/studio-test.tap
```
- **Expected, desktop:** `# fail 0`.
- **Expected, studio:** the `not ok` lines equal the baseline. The new test file passes.

- [ ] **Step 10: Manual check: launch with a file, save in place, second window**

```bash
npm --prefix desktop run build:studio
cp "$(ls samples/*.hwp | head -1)" corpus/spike/launch-test.hwp
cp "$(ls samples/*.hwp | sed -n 2p)" corpus/spike/launch-test-2.hwp
npm --prefix desktop start -- ../corpus/spike/launch-test.hwp
```
1. **Expected:** the window opens directly on `launch-test.hwp`.
2. Click at the start of the first paragraph, type `HWP Word test `, and press **Ctrl+S**. **Expected:** no Save dialog appears (saved in place).
3. With the app still open, run this in a second terminal: `npm --prefix desktop start -- ../corpus/spike/launch-test-2.hwp`. **Expected:** a **second** window opens with that file, and the second command exits.
4. Close both windows, then run `npm --prefix desktop start -- ../corpus/spike/launch-test.hwp` again. **Expected:** the text `HWP Word test` is present.
5. Run `ls corpus/spike/`. **Expected:** no `*.tmp` files.
6. **A failed save must not lose work.**
   1. Run `attrib +r corpus/spike/launch-test.hwp` (in PowerShell or Git Bash).
   2. Open it with `npm --prefix desktop start -- ../corpus/spike/launch-test.hwp`, type a character, and press **Ctrl+S**. **Expected:** an error message appears, and the file on disk is unchanged.
   3. Close the window. **Expected:** the unsaved-changes dialog appears, which shows the document is still dirty. Choose **Don't Save**.
   4. Run `attrib -r corpus/spike/launch-test.hwp`.

- [ ] **Step 11: Commit**

```bash
git add rhwp-studio/src/desktop rhwp-studio/tests/hwpword-desktop-launch-queue.test.ts rhwp-studio/src/main.ts desktop/lib/launch-files.mjs desktop/test/launch-files.test.mjs desktop/preload.cjs desktop/main.mjs
git commit -m "Open launched HWP files and save them in place via token-scoped IPC" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Windows installer and file associations (milestone: usable Korean-UI app)

**Files:**
- Create: `desktop/electron-builder.yml`
- Modify: `desktop/package.json` (add `electron-builder`, `dist` script)

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `npm --prefix desktop run dist` → `desktop/dist/HWP Word Setup 0.1.0.exe`.

- [ ] **Step 1: Add electron-builder and the config**

```bash
npm --prefix desktop install --save-dev --save-exact electron-builder@26.15.3
```
In `desktop/package.json`, add to `"scripts"`:
```json
    "dist": "npm run build:studio && electron-builder --win nsis",
```

`desktop/electron-builder.yml`:
```yaml
appId: local.hwpword.desktop
productName: HWP Word
copyright: "HWP Word personal build on rhwp (MIT, Copyright (c) 2025-2026 Edward Kim)"
directories:
  output: dist
files:
  - main.mjs
  - preload.cjs
  - lib/**
  - package.json
extraResources:
  - from: ../rhwp-studio/dist
    to: studio
win:
  target: nsis
  icon: ../rhwp-studio/public/icons/icon-512.png
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
fileAssociations:
  - ext: hwp
    name: HWP Document
    description: Hangul Word Processor document
    role: Editor
  - ext: hwpx
    name: HWPX Document
    description: Hangul Word Processor XML document
    role: Editor
```

- [ ] **Step 2: Build the installer**

Run: `npm --prefix desktop run dist`
Expected: ends with a line mentioning `desktop\dist\HWP Word Setup 0.1.0.exe`.

**Troubleshooting:** if it fails with `Cannot create symbolic link : A required privilege is not held by the client`, enable **Settings → System → For developers → Developer Mode**, then rerun.

- [ ] **Step 3: Install and verify (user-assisted)**

1. Run `desktop/dist/HWP Word Setup 0.1.0.exe`. Windows SmartScreen may warn because the build is unsigned; choose **More info → Run anyway**. Install for the current user.
2. In Explorer, right-click `D:\Projects\hwpword\corpus\spike\launch-test.hwp` → **Open with → Choose another app → HWP Word**, tick **Always**. **Expected:** HWP Word opens the file.
3. Edit one character, press **Ctrl+S**, and close. Double-click the file again. **Expected:** the edit is there.
4. With it open, double-click `launch-test-2.hwp`. **Expected:** a second window opens.
5. Press **Ctrl+P** → **인쇄** → **Microsoft Print to PDF**. **Expected:** the PDF is correct.

- [ ] **Step 4: Commit**

```bash
git add desktop/electron-builder.yml desktop/package.json desktop/package-lock.json
git commit -m "Package HWP Word as a per-user NSIS installer with .hwp/.hwpx associations" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Milestone 1:** the user can double-click, edit, save, and print HWP files in a desktop app (Korean UI). Report this to the user before starting Phase B.

---

# Phase B — Word-style English shell

### Task 6: Ribbon data and command-ID guard

**Files:**
- Create: `rhwp-studio/tests/hwpword-ribbon-commands.test.ts`
- Create: `rhwp-studio/src/ui/ribbon-data.ts`

**Interfaces:**
- Consumes: studio command sources `rhwp-studio/src/command/commands/*.ts` (read as text).
- Produces:
  - `interface RibbonButton { cmd: string; label: string; icon?: string; glyph?: string; large?: boolean }`
  - `interface RibbonGroup { label: string; buttons?: readonly RibbonButton[]; mountId?: string }`
  - `interface RibbonTab { id: string; label: string; groups: readonly RibbonGroup[] }`
  - `QUICK_ACCESS`, `FILE_PAGE_COMMANDS`, `RIBBON_TABS`

- [ ] **Step 1: Write the failing test**

`rhwp-studio/tests/hwpword-ribbon-commands.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILE_PAGE_COMMANDS, QUICK_ACCESS, RIBBON_TABS, type RibbonButton } from '../src/ui/ribbon-data.ts';

const commandsDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src', 'command', 'commands');

/**
 * Every command ID the studio registers, read from source. The command modules use Vite aliases
 * and DOM dialogs, so they cannot be imported under node --test.
 */
function registeredCommandIds(): Set<string> {
  const ids = new Set<string>();
  for (const file of readdirSync(commandsDir).filter((name) => name.endsWith('.ts'))) {
    const src = readFileSync(join(commandsDir, file), 'utf8');
    for (const m of src.matchAll(/\bid:\s*'([a-z-]+:[a-z0-9-]+)'/g)) ids.add(m[1]);
    for (const m of src.matchAll(/\bzoomLevel\((\d+)/g)) ids.add(`view:zoom-${m[1]}`);
    for (const m of src.matchAll(/\bthemeModeCommand\('([a-z]+)'/g)) ids.add(`view:theme-${m[1]}`);
    for (const m of src.matchAll(/\bthemeSkinCommand\('([a-z]+)'/g)) ids.add(`view:skin-${m[1]}`);
  }
  return ids;
}

function allButtons(): RibbonButton[] {
  return [
    ...QUICK_ACCESS,
    ...FILE_PAGE_COMMANDS,
    ...RIBBON_TABS.flatMap((tab) => tab.groups.flatMap((group) => group.buttons ?? [])),
  ];
}

test('every ribbon button dispatches a command the studio registers', () => {
  const registered = registeredCommandIds();
  assert.ok(registered.size > 150, `expected the full command set, found ${registered.size}`);
  assert.deepEqual(allButtons().map((b) => b.cmd).filter((cmd) => !registered.has(cmd)), []);
});

test('tabs follow Word order and Home hosts the formatting bar', () => {
  assert.deepEqual(RIBBON_TABS.map((tab) => tab.label), ['Home', 'Insert', 'Layout', 'References', 'Review', 'View']);
  assert.ok(RIBBON_TABS[0].groups.some((group) => group.mountId === 'style-bar'));
});

test('the ribbon never offers commands that would hide its own formatting group', () => {
  assert.deepEqual(allButtons().map((b) => b.cmd).filter((cmd) => cmd.startsWith('view:toolbox-')), []);
});

test('ribbon text is English', () => {
  const text = [
    ...allButtons().map((b) => b.label),
    ...RIBBON_TABS.flatMap((tab) => [tab.label, ...tab.groups.map((group) => group.label)]),
  ];
  assert.deepEqual(text.filter((label) => /[\uAC00-\uD7A3]/.test(label)), []);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd rhwp-studio && node --test tests/hwpword-ribbon-commands.test.ts; cd ..`
Expected: FAIL with `Cannot find module …/src/ui/ribbon-data.ts`.

- [ ] **Step 3: Write the ribbon data**

`rhwp-studio/src/ui/ribbon-data.ts`:
```ts
/**
 * HWP Word ribbon layout. Every `cmd` is an existing rhwp-studio command ID;
 * tests/hwpword-ribbon-commands.test.ts fails if one disappears upstream.
 */
export interface RibbonButton {
  readonly cmd: string;
  readonly label: string;
  /** Existing sprite class from styles/toolbar.css, e.g. 'icon-paste'. */
  readonly icon?: string;
  /** Short text glyph for commands without a sprite. */
  readonly glyph?: string;
  /** Large buttons span the group height with the label under the icon. */
  readonly large?: boolean;
}

export interface RibbonGroup {
  readonly label: string;
  readonly buttons?: readonly RibbonButton[];
  /** Moves an existing element (by id) into this group, e.g. the formatting bar. */
  readonly mountId?: string;
}

export interface RibbonTab {
  readonly id: string;
  readonly label: string;
  readonly groups: readonly RibbonGroup[];
}

export const QUICK_ACCESS: readonly RibbonButton[] = [
  { cmd: 'file:save', label: 'Save', icon: 'icon-save' },
  { cmd: 'edit:undo', label: 'Undo', icon: 'icon-undo' },
  { cmd: 'edit:redo', label: 'Redo', icon: 'icon-redo' },
];

export const FILE_PAGE_COMMANDS: readonly RibbonButton[] = [
  { cmd: 'file:new-doc', label: 'New', icon: 'icon-new-doc' },
  { cmd: 'file:open', label: 'Open', glyph: '↥' },
  { cmd: 'file:save', label: 'Save', icon: 'icon-save' },
  { cmd: 'file:save-as', label: 'Save As', glyph: '⎘' },
  { cmd: 'file:save-as-hwp', label: 'Save as HWP', glyph: 'H' },
  { cmd: 'file:save-as-hwpx', label: 'Save as HWPX', glyph: 'X' },
  { cmd: 'file:print', label: 'Print', icon: 'icon-print' },
  { cmd: 'file:print-to-pdf', label: 'Save as PDF', icon: 'icon-pdf' },
  { cmd: 'file:export-doc', label: 'Export to Word (.doc)', glyph: 'W' },
  { cmd: 'file:export-html', label: 'Export to HTML', glyph: '<>' },
  { cmd: 'tool:options', label: 'Options', glyph: '⚙' },
  { cmd: 'file:about', label: 'About', icon: 'icon-help' },
];

export const RIBBON_TABS: readonly RibbonTab[] = [
  {
    id: 'home',
    label: 'Home',
    groups: [
      {
        label: 'Clipboard',
        buttons: [
          { cmd: 'edit:paste', label: 'Paste', icon: 'icon-paste', large: true },
          { cmd: 'edit:cut', label: 'Cut', icon: 'icon-cut' },
          { cmd: 'edit:copy', label: 'Copy', icon: 'icon-copy' },
          { cmd: 'edit:format-copy', label: 'Format Painter', icon: 'icon-format-copy' },
        ],
      },
      { label: 'Font & Paragraph', mountId: 'style-bar' },
      {
        label: 'Font',
        buttons: [
          { cmd: 'format:char-shape', label: 'Character…', icon: 'icon-char-shape', large: true },
          { cmd: 'format:font-size-increase', label: 'Grow Font', glyph: 'A+' },
          { cmd: 'format:font-size-decrease', label: 'Shrink Font', glyph: 'A−' },
          { cmd: 'format:superscript', label: 'Superscript', glyph: 'x²' },
          { cmd: 'format:subscript', label: 'Subscript', glyph: 'x₂' },
          { cmd: 'format:strikethrough', label: 'Strikethrough', glyph: 'S̶' },
        ],
      },
      {
        label: 'Paragraph',
        buttons: [
          { cmd: 'format:para-shape', label: 'Paragraph…', icon: 'icon-para-shape', large: true },
          { cmd: 'format:toggle-bullet', label: 'Bullets', glyph: '•' },
          { cmd: 'format:toggle-numbering', label: 'Numbering', glyph: '1.' },
          { cmd: 'format:level-increase', label: 'Increase Level', glyph: '⇤' },
          { cmd: 'format:level-decrease', label: 'Decrease Level', glyph: '⇥' },
          { cmd: 'format:line-spacing-increase', label: 'More Line Spacing', glyph: '↕+' },
          { cmd: 'format:line-spacing-decrease', label: 'Less Line Spacing', glyph: '↕−' },
          { cmd: 'view:para-mark', label: 'Show Marks', icon: 'icon-para-mark' },
        ],
      },
      {
        label: 'Styles',
        buttons: [{ cmd: 'format:style-dialog', label: 'Styles…', glyph: 'Aa', large: true }],
      },
      {
        label: 'Editing',
        buttons: [
          { cmd: 'edit:find', label: 'Find', icon: 'icon-find' },
          { cmd: 'edit:find-replace', label: 'Replace', icon: 'icon-find-replace' },
          { cmd: 'edit:goto', label: 'Go To', glyph: '→' },
          { cmd: 'edit:select-all', label: 'Select All', icon: 'icon-select-all' },
        ],
      },
    ],
  },
  {
    id: 'insert',
    label: 'Insert',
    groups: [
      { label: 'Tables', buttons: [{ cmd: 'table:create', label: 'Table', icon: 'icon-table', large: true }] },
      {
        label: 'Illustrations',
        buttons: [
          { cmd: 'insert:image', label: 'Picture', icon: 'icon-image', large: true },
          { cmd: 'insert:shape', label: 'Shapes', icon: 'icon-shape', large: true },
          { cmd: 'insert:textbox', label: 'Text Box', icon: 'icon-textbox', large: true },
        ],
      },
      {
        label: 'Header & Footer',
        buttons: [
          { cmd: 'page:header-create', label: 'Header', icon: 'icon-header', large: true },
          { cmd: 'page:footer-create', label: 'Footer', icon: 'icon-footer', large: true },
          { cmd: 'page:insert-field-pagenum', label: 'Page Number', glyph: '#' },
          { cmd: 'page:insert-field-totalpage', label: 'Total Pages', glyph: 'Σ' },
          { cmd: 'page:insert-field-filename', label: 'File Name', glyph: 'ƒ' },
        ],
      },
      {
        label: 'Notes',
        buttons: [
          { cmd: 'insert:footnote', label: 'Footnote', icon: 'icon-footnote', large: true },
          { cmd: 'insert:endnote', label: 'Endnote', icon: 'icon-endnote', large: true },
        ],
      },
      {
        label: 'Symbols',
        buttons: [
          { cmd: 'insert:equation', label: 'Equation', glyph: 'π', large: true },
          { cmd: 'insert:symbols', label: 'Symbol', icon: 'icon-symbols', large: true },
        ],
      },
      {
        label: 'Links',
        buttons: [
          { cmd: 'insert:bookmark', label: 'Bookmark', glyph: '⚑' },
          { cmd: 'insert:field', label: 'Field', glyph: '{ }' },
        ],
      },
      {
        label: 'Breaks',
        buttons: [
          { cmd: 'page:break', label: 'Page Break', glyph: '⤓' },
          { cmd: 'page:column-break', label: 'Column Break', glyph: '⫼' },
        ],
      },
    ],
  },
  {
    id: 'layout',
    label: 'Layout',
    groups: [
      {
        label: 'Page Setup',
        buttons: [
          { cmd: 'page:setup', label: 'Page Setup…', icon: 'icon-page-setup', large: true },
          { cmd: 'page:page-border', label: 'Page Borders…', glyph: '▢', large: true },
        ],
      },
      {
        label: 'Columns',
        buttons: [
          { cmd: 'page:col-1', label: 'One', glyph: '▮' },
          { cmd: 'page:col-2', label: 'Two', glyph: '▮▮' },
          { cmd: 'page:col-3', label: 'Three', glyph: '▮▮▮' },
          { cmd: 'page:col-left', label: 'Left', glyph: '▌▮' },
          { cmd: 'page:col-right', label: 'Right', glyph: '▮▐' },
          { cmd: 'page:col-settings', label: 'More Columns…', glyph: '⋯' },
        ],
      },
      {
        label: 'Section',
        buttons: [
          { cmd: 'page:section-settings', label: 'Section…', glyph: '§', large: true },
          { cmd: 'page:new-page-num', label: 'Restart Page Numbers…', glyph: '1' },
          { cmd: 'page:hide-current', label: 'Hide on This Page', glyph: '⊘' },
        ],
      },
      {
        label: 'Rows & Columns',
        buttons: [
          { cmd: 'table:insert-row-above', label: 'Insert Above', glyph: '⬆' },
          { cmd: 'table:insert-row-below', label: 'Insert Below', glyph: '⬇' },
          { cmd: 'table:insert-col-left', label: 'Insert Left', glyph: '⬅' },
          { cmd: 'table:insert-col-right', label: 'Insert Right', glyph: '➡' },
          { cmd: 'table:delete-row', label: 'Delete Row', glyph: '⊖' },
          { cmd: 'table:delete-col', label: 'Delete Column', glyph: '⊖' },
        ],
      },
      {
        label: 'Cells',
        buttons: [
          { cmd: 'table:cell-props', label: 'Table Properties…', icon: 'icon-table', large: true },
          { cmd: 'table:cell-merge', label: 'Merge Cells', glyph: '⊞' },
          { cmd: 'table:cell-split', label: 'Split Cells…', glyph: '⊟' },
        ],
      },
      {
        label: 'Arrange',
        buttons: [
          { cmd: 'format:object-properties', label: 'Object Properties…', icon: 'icon-obj-props', large: true },
          { cmd: 'insert:arrange-front', label: 'Bring to Front', glyph: '⇈' },
          { cmd: 'insert:arrange-back', label: 'Send to Back', glyph: '⇊' },
          { cmd: 'insert:rotate-cw', label: 'Rotate Right', glyph: '↷' },
          { cmd: 'insert:rotate-ccw', label: 'Rotate Left', glyph: '↶' },
          { cmd: 'insert:group-shapes', label: 'Group', glyph: '▣' },
        ],
      },
    ],
  },
  {
    id: 'references',
    label: 'References',
    groups: [
      {
        label: 'Footnotes',
        buttons: [
          { cmd: 'insert:footnote', label: 'Insert Footnote', icon: 'icon-footnote', large: true },
          { cmd: 'insert:endnote', label: 'Insert Endnote', icon: 'icon-endnote', large: true },
          { cmd: 'insert:endnote-shape', label: 'Note Settings…', glyph: '⚙' },
        ],
      },
      {
        label: 'Captions',
        buttons: [{ cmd: 'insert:caption-toggle', label: 'Insert Caption', glyph: 'Cap', large: true }],
      },
      { label: 'Links', buttons: [{ cmd: 'insert:bookmark', label: 'Bookmark', glyph: '⚑', large: true }] },
    ],
  },
  {
    id: 'review',
    label: 'Review',
    groups: [
      { label: 'Compare', buttons: [{ cmd: 'edit:compare-documents', label: 'Compare…', glyph: '⇆', large: true }] },
      { label: 'History', buttons: [{ cmd: 'edit:document-history', label: 'Version History…', glyph: '⟲', large: true }] },
      { label: 'Forms', buttons: [{ cmd: 'view:form-mode', label: 'Form Mode', glyph: '☐', large: true }] },
    ],
  },
  {
    id: 'view',
    label: 'View',
    groups: [
      {
        label: 'Show',
        buttons: [
          { cmd: 'view:para-mark', label: 'Paragraph Marks', icon: 'icon-para-mark' },
          { cmd: 'view:ctrl-mark', label: 'Control Codes', icon: 'icon-ctrl-mark' },
          { cmd: 'view:border-transparent', label: 'Table Gridlines', glyph: '┼' },
          { cmd: 'view:toggle-grid', label: 'Grid', icon: 'icon-grid' },
          { cmd: 'view:grid-settings', label: 'Grid Settings…', icon: 'icon-grid' },
          { cmd: 'view:toggle-clip', label: 'Show Clipping', glyph: '✂' },
        ],
      },
      {
        label: 'Zoom',
        buttons: [
          { cmd: 'view:zoom-dialog', label: 'Zoom…', icon: 'icon-zoom-menu-in', large: true },
          { cmd: 'view:zoom-100', label: '100%', glyph: '1:1', large: true },
          { cmd: 'view:zoom-fit-page', label: 'One Page', glyph: '▯' },
          { cmd: 'view:zoom-fit-width', label: 'Page Width', glyph: '↔' },
          { cmd: 'view:zoom-in', label: 'Zoom In', icon: 'icon-zoom-menu-in' },
          { cmd: 'view:zoom-out', label: 'Zoom Out', icon: 'icon-zoom-menu-out' },
        ],
      },
      {
        label: 'Theme',
        buttons: [
          { cmd: 'view:theme-light', label: 'Light', glyph: '☀' },
          { cmd: 'view:theme-dark', label: 'Dark', glyph: '☾' },
          { cmd: 'view:theme-system', label: 'System', glyph: '◐' },
        ],
      },
    ],
  },
];
```

- [ ] **Step 4: Run the test**

Run: `cd rhwp-studio && node --test tests/hwpword-ribbon-commands.test.ts; cd ..`
Expected: `# pass 4`, `# fail 0`. If the first test lists unknown IDs, fix the typo in `ribbon-data.ts` using the IDs in `src/command/commands/*.ts`. Never invent commands.

- [ ] **Step 5: Commit**

```bash
git add rhwp-studio/src/ui/ribbon-data.ts rhwp-studio/tests/hwpword-ribbon-commands.test.ts
git commit -m "Add Word-style ribbon layout mapped to existing studio commands" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Ribbon UI and Word look

**Files:**
- Create: `rhwp-studio/tests/hwpword-ribbon-wiring.test.ts`
- Create: `rhwp-studio/src/ui/ribbon.ts`
- Create: `rhwp-studio/src/styles/hwpword.css`
- Modify: `rhwp-studio/src/style.css` (append one import)
- Modify: `rhwp-studio/index.html` (one line after the hidden `<h1>`)
- Modify: `rhwp-studio/src/main.ts` (one import, one constructor call)

**Interfaces:**
- Consumes:
  - from Task 6: `RIBBON_TABS`, `QUICK_ACCESS`, `FILE_PAGE_COMMANDS`, `RibbonButton`, `RibbonGroup`
  - `CommandDispatcher.dispatch(id, params)` and `CommandDispatcher.isEnabled(id)`
  - `EventBus.on(event, handler)`
  - `listRecentDocs(): Promise<RecentDoc[]>` from `@/recent/recent-store`
  - the `file:open-recent` command, which takes `{ id }`
- Produces: `class Ribbon { constructor(root: HTMLElement, eventBus: EventBus, dispatcher: CommandDispatcher) }`, mounted at `#ribbon`.

- [ ] **Step 1: Write the failing test**

`rhwp-studio/tests/hwpword-ribbon-wiring.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from './support/source-guard.ts';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const source = (path: string) => readFileSync(join(rootDir, path), 'utf8');

test('index.html mounts the ribbon at the top of the studio header', () => {
  assert.match(
    source('index.html'),
    /<header id="studio-header">\s*<h1 class="visually-hidden">[^<]*<\/h1>\s*<div id="ribbon"><\/div>/,
  );
});

test('main.ts constructs the ribbon with the shared dispatcher', () => {
  const main = codeOnly(source('src/main.ts'));
  assert.match(main, /import \{ Ribbon \} from '@\/ui\/ribbon';/);
  assert.match(main, /new Ribbon\(document\.getElementById\('ribbon'\)!, eventBus, dispatcher\);/);
});

test('the Word look loads last and hides the classic menu bar and icon toolbar', () => {
  const lines = source('src/style.css').trim().split('\n');
  assert.equal(lines.at(-1), "@import './styles/hwpword.css';");
  assert.match(source('src/styles/hwpword.css'), /#menu-bar,\s*#icon-toolbar\s*\{\s*display:\s*none !important;/);
});

test('ribbon buttons act on mousedown so the editor keeps its text selection', () => {
  const ribbon = codeOnly(source('src/ui/ribbon.ts'));
  assert.match(ribbon, /addEventListener\('mousedown', \(event\) => \{\s*if \(event\.button !== 0\) return;\s*event\.preventDefault\(\);/);
  // A distinct attribute keeps upstream's global [data-cmd] scanners from double-binding ribbon buttons.
  assert.doesNotMatch(ribbon, /dataset\.cmd\b/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd rhwp-studio && node --test tests/hwpword-ribbon-wiring.test.ts; cd ..`
Expected: 4 failing tests (missing mount, import, stylesheet, ribbon file).

- [ ] **Step 3: Implement the ribbon**

`rhwp-studio/src/ui/ribbon.ts`:
```ts
import type { CommandDispatcher } from '@/command/dispatcher';
import type { EventBus } from '@/core/event-bus';
import { listRecentDocs, type RecentDoc } from '@/recent/recent-store';
import { FILE_PAGE_COMMANDS, QUICK_ACCESS, RIBBON_TABS, type RibbonButton, type RibbonGroup } from './ribbon-data';

const ACTIVE_TAB_KEY = 'hwpword.ribbon.tab';

/**
 * Word-style ribbon for HWP Word. Renders ribbon-data.ts, dispatches existing command IDs through the
 * shared CommandDispatcher, and mirrors enabled state the way MenuBar does.
 */
export class Ribbon {
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly tabButtons = new Map<string, HTMLButtonElement>();
  private readonly panels = new Map<string, HTMLElement>();
  private readonly filePage: HTMLElement;
  private activeTab = 'home';
  private refreshQueued = false;

  constructor(
    private readonly root: HTMLElement,
    eventBus: EventBus,
    private readonly dispatcher: CommandDispatcher,
  ) {
    root.classList.add('ribbon');
    const strip = this.renderStrip();
    const panelHost = document.createElement('div');
    panelHost.className = 'ribbon-panels';
    for (const tab of RIBBON_TABS) {
      const panel = document.createElement('div');
      panel.className = 'ribbon-panel';
      panel.id = `ribbon-panel-${tab.id}`;
      panel.setAttribute('role', 'tabpanel');
      for (const group of tab.groups) panel.append(this.renderGroup(group));
      this.panels.set(tab.id, panel);
      panelHost.append(panel);
    }
    this.filePage = this.renderFilePage();
    root.replaceChildren(strip, panelHost, this.filePage);

    // Same rule as the classic toolbars (main.ts #780): clicking chrome must not steal the editor's selection.
    root.addEventListener('mousedown', (event) => {
      if ((event.target as HTMLElement).closest('input, select, textarea')) return;
      event.preventDefault();
    });

    let saved: string | null = null;
    try {
      saved = localStorage.getItem(ACTIVE_TAB_KEY);
    } catch {
      saved = null;
    }
    this.selectTab(saved && this.panels.has(saved) ? saved : 'home');
    eventBus.on('command-state-changed', () => this.scheduleRefresh());
  }

  private renderStrip(): HTMLElement {
    const strip = document.createElement('div');
    strip.className = 'ribbon-strip';

    const quick = document.createElement('div');
    quick.className = 'ribbon-quick';
    for (const button of QUICK_ACCESS) quick.append(this.renderButton(button, 'ribbon-btn-quick'));

    const tabs = document.createElement('div');
    tabs.className = 'ribbon-tabs';
    tabs.setAttribute('role', 'tablist');

    const fileTab = document.createElement('button');
    fileTab.type = 'button';
    fileTab.className = 'ribbon-tab ribbon-tab-file';
    fileTab.textContent = 'File';
    fileTab.addEventListener('click', () => this.openFilePage());
    tabs.append(fileTab);

    for (const tab of RIBBON_TABS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ribbon-tab';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `ribbon-panel-${tab.id}`);
      button.textContent = tab.label;
      button.addEventListener('click', () => this.selectTab(tab.id));
      button.addEventListener('dblclick', () => this.root.classList.toggle('ribbon-collapsed'));
      this.tabButtons.set(tab.id, button);
      tabs.append(button);
    }

    strip.append(quick, tabs);
    return strip;
  }

  private renderGroup(group: RibbonGroup): HTMLElement {
    const section = document.createElement('section');
    section.className = 'ribbon-group';
    section.setAttribute('aria-label', group.label);
    const body = document.createElement('div');
    body.className = 'ribbon-group-body';
    if (group.mountId) {
      const mounted = document.getElementById(group.mountId);
      if (mounted) body.append(mounted);
    }
    for (const button of group.buttons ?? []) body.append(this.renderButton(button));
    const label = document.createElement('div');
    label.className = 'ribbon-group-label';
    label.textContent = group.label;
    section.append(body, label);
    return section;
  }

  private renderButton(button: RibbonButton, extraClass?: string): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = ['ribbon-btn', button.large ? 'ribbon-btn-large' : '', extraClass ?? ''].filter(Boolean).join(' ');
    el.dataset.ribbonCmd = button.cmd;
    el.title = button.label;

    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    if (button.icon) {
      icon.className = `tb-sprite ${button.icon}`;
    } else {
      icon.className = 'ribbon-glyph';
      icon.textContent = button.glyph ?? '';
    }
    const label = document.createElement('span');
    label.className = 'ribbon-btn-label';
    label.textContent = button.label;
    el.append(icon, label);

    el.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.run(button.cmd, el);
    });
    el.addEventListener('click', (event) => {
      if (event.detail === 0) this.run(button.cmd, el); // keyboard activation (Enter/Space)
    });
    this.buttons.push(el);
    return el;
  }

  private run(cmd: string, anchorEl: HTMLElement): void {
    this.closeFilePage();
    this.dispatcher.dispatch(cmd, { anchorEl });
  }

  private selectTab(id: string): void {
    this.activeTab = id;
    for (const [tabId, button] of this.tabButtons) {
      const active = tabId === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    }
    for (const [tabId, panel] of this.panels) panel.hidden = tabId !== id;
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, id);
    } catch {
      // Storage unavailable: the tab just won't be remembered.
    }
    this.refreshStates();
    // The formatting bar measures its width to decide overflow; let it re-measure once visible.
    window.dispatchEvent(new Event('resize'));
  }

  private scheduleRefresh(): void {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    requestAnimationFrame(() => {
      this.refreshQueued = false;
      this.refreshStates();
    });
  }

  /** Only visible buttons are checked: isEnabled builds an editor-context snapshot per call. */
  private refreshStates(): void {
    const panel = this.panels.get(this.activeTab);
    for (const el of this.buttons) {
      const inPanel = el.closest('.ribbon-panel');
      if (inPanel && inPanel !== panel) continue;
      el.disabled = !this.dispatcher.isEnabled(el.dataset.ribbonCmd!);
    }
  }

  private renderFilePage(): HTMLElement {
    const page = document.createElement('div');
    page.className = 'ribbon-file-page';
    page.hidden = true;

    const nav = document.createElement('nav');
    nav.className = 'ribbon-file-nav';
    nav.setAttribute('aria-label', 'File');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'ribbon-file-back';
    back.textContent = '← Back';
    back.addEventListener('click', () => this.closeFilePage());
    nav.append(back);
    for (const button of FILE_PAGE_COMMANDS) nav.append(this.renderButton(button, 'ribbon-file-item'));

    const recent = document.createElement('section');
    recent.className = 'ribbon-file-recent';
    page.append(nav, recent);
    page.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeFilePage();
    });
    return page;
  }

  private openFilePage(): void {
    this.filePage.hidden = false;
    this.refreshStates();
    void this.renderRecent();
    this.filePage.querySelector<HTMLButtonElement>('.ribbon-file-back')?.focus();
  }

  private closeFilePage(): void {
    this.filePage.hidden = true;
  }

  private async renderRecent(): Promise<void> {
    const host = this.filePage.querySelector<HTMLElement>('.ribbon-file-recent')!;
    let docs: RecentDoc[] = [];
    try {
      docs = await listRecentDocs();
    } catch (error) {
      console.warn('[ribbon] could not list recent documents', error);
    }
    const heading = document.createElement('h2');
    heading.textContent = 'Recent';
    const list = document.createElement('div');
    list.className = 'ribbon-file-recent-list';
    if (docs.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No recent documents.';
      list.append(empty);
    }
    for (const doc of docs) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'ribbon-file-recent-item';
      item.title = doc.fileName;
      item.textContent = `${doc.fileName} · ${doc.sourceFormat.toUpperCase()}`;
      item.addEventListener('mousedown', (event) => {
        event.preventDefault();
        this.closeFilePage();
        this.dispatcher.dispatch('file:open-recent', { id: doc.id });
      });
      list.append(item);
    }
    host.replaceChildren(heading, list);
  }
}
```

`rhwp-studio/src/styles/hwpword.css`:
```css
/* HWP Word: Word-style chrome on top of rhwp-studio. Imported last from style.css. */

#menu-bar,
#icon-toolbar {
  display: none !important;
}

:root {
  --font-family-ui: 'Segoe UI', 'Malgun Gothic', sans-serif;
  --hwpword-accent: #185abd;
  --hwpword-accent-hover: #124b9e;
  --hwpword-on-accent: #ffffff;
}

:root:not([data-theme-effective="dark"]) {
  --ui-bg: #f3f2f1;
  --ui-bg-light: #faf9f8;
  --ui-surface-raised: #ffffff;
  --ui-surface-muted: #edebe9;
  --ui-border: #d2d0ce;
  --ui-border-light: #e1dfdd;
  --ui-border-subtle: #edebe9;
  --ui-border-strong: #c8c6c4;
  --ui-hover: #edebe9;
  --ui-hover-strong: #e1dfdd;
  --ui-active: #d2d0ce;
  --ui-selected: #deecf9;
  --ui-menu-open: #185abd;
  --ui-menu-open-border: #185abd;
  --ui-toolbar-bg-start: #ffffff;
  --ui-toolbar-bg-end: #ffffff;
  --accent-primary: #185abd;
  --accent-strong: #124078;
  --accent-light: #2b88d8;
}

:root[data-theme-effective="dark"] {
  --hwpword-accent: #479ef5;
  --hwpword-accent-hover: #2f7fd1;
  --hwpword-on-accent: #0b1a2b;
}

.ribbon {
  display: flex;
  flex-direction: column;
  background: var(--ui-surface-raised);
  border-bottom: 1px solid var(--ui-border);
  color: var(--ui-text);
  font-family: var(--font-family-ui);
}

.ribbon-strip {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  min-height: 34px;
  padding: 4px 8px 0;
}

.ribbon-quick {
  display: flex;
  align-self: center;
  gap: 2px;
  padding-right: 10px;
  border-right: 1px solid var(--ui-border-light);
}

.ribbon-tabs {
  display: flex;
  gap: 2px;
}

.ribbon-tab {
  padding: 6px 12px 5px;
  border: 0;
  border-bottom: 3px solid transparent;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.ribbon-tab:hover {
  background: var(--ui-hover);
}

.ribbon-tab.active {
  border-bottom-color: var(--hwpword-accent);
  color: var(--hwpword-accent);
  font-weight: 600;
}

.ribbon-tab-file {
  color: var(--hwpword-accent);
  font-weight: 600;
}

.ribbon-panels {
  border-top: 1px solid var(--ui-border-light);
}

.ribbon-collapsed .ribbon-panels {
  display: none;
}

.ribbon-panel {
  display: flex;
  align-items: stretch;
  min-height: 98px;
  padding: 4px 6px 0;
  overflow-x: auto;
}

.ribbon-panel[hidden] {
  display: none;
}

.ribbon-group {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  padding: 0 8px;
  border-right: 1px solid var(--ui-border-light);
}

.ribbon-group-body {
  display: grid;
  flex: 1;
  grid-auto-flow: column;
  grid-template-rows: repeat(3, 26px);
  align-content: start;
  gap: 1px 4px;
}

.ribbon-group-label {
  padding: 2px 0 3px;
  color: var(--ui-text-muted);
  font-size: 11px;
  text-align: center;
  white-space: nowrap;
}

.ribbon-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}

.ribbon-btn:hover:not(:disabled) {
  border-color: var(--ui-border-light);
  background: var(--ui-hover);
}

.ribbon-btn:disabled {
  color: var(--ui-text-disabled);
  cursor: default;
}

.ribbon-btn:disabled .tb-sprite,
.ribbon-btn:disabled .ribbon-glyph {
  opacity: 0.4;
}

.ribbon-btn-large {
  grid-row: span 3;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  min-width: 58px;
  padding: 4px 6px;
}

.ribbon-btn-large .tb-sprite,
.ribbon-btn-large .ribbon-glyph {
  transform: scale(1.35);
}

.ribbon-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  font-size: 13px;
  line-height: 1;
}

.ribbon-btn-quick {
  padding: 3px;
}

.ribbon-btn-quick .ribbon-btn-label {
  display: none;
}

/* The existing formatting bar lives inside the Home tab. */
.ribbon-group-body > #style-bar {
  grid-row: span 3;
  padding: 0;
  border: 0;
  background: transparent;
}

/* File page (Word's "backstage") */
.ribbon-file-page {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: grid;
  grid-template-columns: 240px 1fr;
  background: var(--ui-surface-raised);
}

.ribbon-file-page[hidden] {
  display: none;
}

.ribbon-file-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 8px;
  background: var(--hwpword-accent);
}

.ribbon-file-back,
.ribbon-file-nav .ribbon-btn {
  padding: 8px 12px;
  border: 0;
  background: transparent;
  color: var(--hwpword-on-accent);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.ribbon-file-back {
  margin-bottom: 12px;
}

.ribbon-file-back:hover,
.ribbon-file-nav .ribbon-btn:hover:not(:disabled) {
  background: var(--hwpword-accent-hover);
}

.ribbon-file-nav .ribbon-btn:disabled {
  color: var(--hwpword-on-accent);
  opacity: 0.5;
}

.ribbon-file-nav .tb-sprite {
  filter: brightness(0) invert(1);
}

.ribbon-file-recent {
  padding: 24px 32px;
  overflow-y: auto;
  color: var(--ui-text);
}

.ribbon-file-recent h2 {
  margin: 0 0 16px;
  font-size: 24px;
  font-weight: 400;
}

.ribbon-file-recent-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 720px;
}

.ribbon-file-recent-item {
  padding: 10px 12px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.ribbon-file-recent-item:hover {
  background: var(--ui-hover);
}
```

- [ ] **Step 4: Wire it in**

- **`rhwp-studio/src/style.css`:** append one final line:
  ```css
  @import './styles/hwpword.css';
  ```

- **`rhwp-studio/index.html`:** directly after the line
  ```html
        <h1 class="visually-hidden">rhwp-studio 문서 편집기</h1>
  ```
  insert
  ```html
        <div id="ribbon"></div>
  ```

- **`rhwp-studio/src/main.ts`:** make two edits.
  1. Directly after the line
     ```ts
     import { MenuBar } from '@/ui/menu-bar';
     ```
     add
     ```ts
     import { Ribbon } from '@/ui/ribbon';
     ```
  2. Directly after this block, which ends with `});`
     ```ts
         new MenuBar(document.getElementById('menu-bar')!, eventBus, dispatcher, registry, {
           onMenuOpen: (menuName) => {
             if (menuName === 'file') void renderRecentSubmenu();
           },
         });
     ```
     add
     ```ts
         new Ribbon(document.getElementById('ribbon')!, eventBus, dispatcher);
     ```

- [ ] **Step 5: Run the tests**

```bash
cd rhwp-studio && node --test tests/hwpword-ribbon-wiring.test.ts tests/hwpword-ribbon-commands.test.ts; cd ..
(cd rhwp-studio && npm test > ../corpus/studio-test.tap 2>&1); grep -E "^not ok " corpus/studio-test.tap
```
- **Expected, new tests:** all pass.
- **Expected, studio suite:** the `not ok` lines equal the baseline. If a baseline-passing upstream test now fails, the change broke something upstream relies on. Fix our change, not the upstream test.

- [ ] **Step 6: Visual and behavioural check in the app**

```bash
npm --prefix desktop run build:studio
cp "$(ls samples/*.hwp | head -1)" corpus/spike/ribbon-test.hwp
npm --prefix desktop start -- ../corpus/spike/ribbon-test.hwp
```
Check each item; all must hold.
1. There is no classic menu bar or icon toolbar. The ribbon shows **File Home Insert Layout References Review View**, with Save/Undo/Redo icons at the left.
2. **Home** contains the formatting bar (font name, size, B/I/U, alignment) plus the Clipboard/Font/Paragraph/Styles/Editing groups.
3. Select a word in the document and click **Superscript**. **Expected:** the word becomes superscript, and the selection stays.
4. Select a word and click **B** in the formatting bar. **Expected:** it becomes bold.
5. **Insert → Table** opens the table dialog. Insert a 2×2 table and put the caret inside it. **Layout → Insert Below** adds a row.
6. With the caret outside any table, **Layout → Merge Cells** is disabled.
7. **File** opens the full-window File page with a Recent list. **Open** shows the Windows Open dialog. **Escape** closes the page.
8. **View → Dark** switches to dark mode, and the ribbon is legible. Switch back with **View → Light**.
9. Double-clicking the **Home** tab collapses the panels; double-clicking again restores them.
10. Resize the window to about 1000 px wide. The ribbon panel scrolls horizontally instead of overlapping the page.

- [ ] **Step 7: Commit**

```bash
git add rhwp-studio/src/ui/ribbon.ts rhwp-studio/src/styles/hwpword.css rhwp-studio/src/style.css rhwp-studio/index.html rhwp-studio/src/main.ts rhwp-studio/tests/hwpword-ribbon-wiring.test.ts
git commit -m "Replace classic menus with a Word-style ribbon and File page" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: English UI guard, glossary, and shell translation

**Files:**
- Create: `docs/hwpword/glossary.md`
- Create: `rhwp-studio/tests/hwpword-english-ui.test.ts`
- Modify: English strings in:
  - `rhwp-studio/index.html`, the section from `<div id="style-bar">` to `</footer>` only
  - `rhwp-studio/src/main.ts`
  - `rhwp-studio/src/command/commands/file.ts`
  - `rhwp-studio/src/command/file-system-access.ts`
  - `rhwp-studio/src/ui/dialog.ts`, `rhwp-studio/src/ui/toast.ts`, `rhwp-studio/src/ui/toolbar.ts`
  - `rhwp-studio/src/ui/unsaved-changes-dialog.ts`, `rhwp-studio/src/ui/hwp-password-dialog.ts`
  - `rhwp-studio/src/ui/save-as-dialog.ts`, `rhwp-studio/src/ui/pdf-print-dialog.ts`, `rhwp-studio/src/ui/about-dialog.ts`
  - `rhwp-studio/src/view/page-indicator.ts`, `rhwp-studio/src/view/zoom-status-controls.ts`
- Modify: upstream tests under `rhwp-studio/tests/` that assert Korean strings changed in this task

**Interfaces:**
- Consumes: nothing new.
- Produces: `ENGLISH_UI_SOURCES` (a string array in `tests/hwpword-english-ui.test.ts`), which Tasks 9–11 append to. Also `docs/hwpword/glossary.md`.

- [ ] **Step 1: Write the glossary**

`docs/hwpword/glossary.md`:
```markdown
# HWP Word translation glossary

Use these terms for every English string in the studio. Consistency beats cleverness.

## Copy rules

- Title Case for tab names, group names, buttons, menu items and dialog titles ("Page Setup", "Insert Above").
- Sentence case for messages, labels inside dialogs and tooltips ("Choose a file with the .hwp extension.").
- Commands that open a dialog end with "…" ("Paragraph…").
- Keep keyboard shortcuts, units (pt, mm, %, cm) and numbers unchanged.
- Product name: "HWP Word". Keep "rhwp" only where credits or licenses name the engine.
- Never translate: font family names (함초롬바탕, 맑은 고딕, …), style names that come from documents,
  and Hancom's attribution sentence in the About dialog.
- If a Korean string is compared, parsed, used as a key, or sent to the engine, do not translate it;
  add the comment `// hwpword-keep-korean` at the end of that line.

## Terms

| Korean | English |
|---|---|
| 파일 / 편집 / 보기 / 입력 / 서식 / 쪽 / 표 / 도구 | File / Edit / View / Insert / Format / Page / Table / Tools |
| 새로 만들기 / 열기 / 저장 / 다른 이름으로 저장 | New / Open / Save / Save As |
| 인쇄 / 인쇄 미리보기 / PDF로 저장 | Print / Print Preview / Save as PDF |
| 확인 / 취소 / 닫기 / 적용 / 설정 | OK / Cancel / Close / Apply / Settings |
| 되돌리기 / 다시 실행 | Undo / Redo |
| 오려 두기 / 복사하기 / 붙이기 / 지우기 / 모두 선택 | Cut / Copy / Paste / Delete / Select All |
| 모양 복사 | Format Painter |
| 찾기 / 찾아 바꾸기 / 다시 찾기 / 찾아가기 | Find / Replace / Find Next / Go To |
| 글자 모양 | Character (dialog title: Character Format) |
| 문단 모양 | Paragraph (dialog title: Paragraph Format) |
| 글꼴 / 글자 크기 / 크기 | Font / Font Size / Size |
| 장평 | Character Width |
| 자간 | Character Spacing |
| 줄 간격 | Line Spacing |
| 굵게 / 기울임 / 밑줄 / 취소선 | Bold / Italic / Underline / Strikethrough |
| 위 첨자 / 아래 첨자 | Superscript / Subscript |
| 양각 / 음각 / 외곽선 / 그림자 | Emboss / Engrave / Outline / Shadow |
| 글자 색 / 형광펜 | Font Color / Highlight |
| 왼쪽 / 가운데 / 오른쪽 / 양쪽 / 배분 / 나눔 정렬 | Align Left / Center / Align Right / Justify / Distributed / Split |
| 들여쓰기 / 내어쓰기 / 여백 | Indent / Hanging Indent / Margin |
| 문단 위 / 문단 아래 | Space Before / Space After |
| 글머리표 / 문단 번호 / 수준 | Bullets / Numbering / Level |
| 스타일 / 바탕글 | Style / Normal |
| 언어: 대표 / 한글 / 영문 / 한자 / 일어 / 외국어 / 기호 / 사용자 | Script: All / Hangul / Latin / Hanja / Japanese / Other / Symbol / User |
| 편집 용지 | Page Setup |
| 용지 종류 / 용지 방향 / 세로 / 가로 | Paper Size / Orientation / Portrait / Landscape |
| 머리말 / 꼬리말 | Header / Footer |
| 쪽 / 쪽 번호 / 총 쪽수 | Page / Page Number / Total Pages |
| 쪽 나누기 / 단 나누기 | Page Break / Column Break |
| 쪽 테두리/배경 | Page Borders and Background |
| 구역 / 구역 설정 | Section / Section Settings |
| 단 / 다단 설정 | Columns / Column Settings |
| 각주 / 미주 | Footnote / Endnote |
| 표 만들기 / 표/셀 속성 | Insert Table / Table Properties |
| 줄 / 칸 (in tables) | Row / Column |
| 셀 합치기 / 셀 나누기 | Merge Cells / Split Cells |
| 테두리 / 배경 | Borders / Shading |
| 캡션 | Caption |
| 개체 / 개체 속성 | Object / Object Properties |
| 그림 / 도형 / 글상자 | Picture / Shape / Text Box |
| 수식 / 문자표 / 책갈피 | Equation / Symbols / Bookmark |
| 누름틀 | Click-here Field |
| 조판 부호 / 문단 부호 / 투명 선 / 격자 | Control Codes / Paragraph Marks / Table Gridlines / Grid |
| 확대 / 축소 / 쪽 맞춤 / 폭 맞춤 | Zoom In / Zoom Out / One Page / Page Width |
| 삽입 / 수정 (status bar mode) | Insert / Overtype |
| 양식 모드 | Form Mode |
| 배포용 문서 | Distribution document (read-only) |
| 암호 | Password |
| 문서 / 최근 문서 | Document / Recent Documents |
| 제품 정보 | About HWP Word |
| 환경 설정 | Options |
```

- [ ] **Step 2: Write the failing guard test**

`rhwp-studio/tests/hwpword-english-ui.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from './support/source-guard.ts';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

/** Studio sources whose user-visible strings must be English. Each translation task appends its files. */
const ENGLISH_UI_SOURCES = [
  'src/main.ts',
  'src/command/commands/file.ts',
  'src/command/file-system-access.ts',
  'src/ui/dialog.ts',
  'src/ui/toast.ts',
  'src/ui/toolbar.ts',
  'src/ui/unsaved-changes-dialog.ts',
  'src/ui/hwp-password-dialog.ts',
  'src/ui/save-as-dialog.ts',
  'src/ui/pdf-print-dialog.ts',
  'src/ui/about-dialog.ts',
  'src/view/page-indicator.ts',
  'src/view/zoom-status-controls.ts',
];

const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;

/**
 * Korean that is document data, not UI: font families that must match fonts named inside HWP files,
 * and Hancom's attribution sentence, whose exact wording the HWP spec licence requires. Longer names first.
 */
const KOREAN_DATA = [
  '본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.',
  '함초롬바탕',
  '함초롬돋움',
  '한컴바탕',
  '한컴돋움',
  '맑은 고딕',
  '나눔고딕',
  '나눔명조',
  '바탕체',
  '돋움체',
  '굴림체',
  '궁서체',
  '바탕',
  '돋움',
  '굴림',
  '궁서',
];

const KEEP_MARKER = 'hwpword-keep-korean';

function withoutKoreanData(line: string): string {
  return KOREAN_DATA.reduce((text, name) => text.split(name).join(''), line);
}

function koreanUiLines(relativePath: string): string[] {
  const raw = readFileSync(join(rootDir, relativePath), 'utf8').split('\n');
  const code = codeOnly(raw.join('\n')).split('\n');
  return code.flatMap((line, index) => {
    if (raw[index].includes(KEEP_MARKER)) return [];
    if (/\bconsole\.(log|info|warn|error|debug)\(/.test(line)) return [];
    return HANGUL.test(withoutKoreanData(line)) ? [`${relativePath}:${index + 1}: ${raw[index].trim()}`] : [];
  });
}

test('translated studio sources contain no Korean UI strings', () => {
  assert.deepEqual(ENGLISH_UI_SOURCES.flatMap(koreanUiLines), []);
});

test('the visible style bar and status bar in index.html are English', () => {
  const html = readFileSync(join(rootDir, 'index.html'), 'utf8');
  const start = html.indexOf('<div id="style-bar">');
  const end = html.indexOf('</footer>');
  assert.ok(start > 0 && end > start, 'style bar / status bar markers not found in index.html');
  const offenders = html
    .slice(start, end)
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => HANGUL.test(withoutKoreanData(line)))
    .map((line) => line.trim());
  assert.deepEqual(offenders, []);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd rhwp-studio && node --test tests/hwpword-english-ui.test.ts; cd ..`
Expected: FAIL. Both tests list offending lines as `path:line: text`; that list is the work queue for Step 4.

- [ ] **Step 4: Translate every listed line**

Work file by file through the failure output. For each offending line:
1. **Check whether the string is logic, not UI.** If it is a string literal, run `grep -rn "<the exact Korean string>" rhwp-studio/src rhwp-studio/tests` first.
   - **Logic:** a comparison (`===`), a regex, a `Map`/object key, something parsed from user input, or a value sent to the WASM engine. Leave it and append `// hwpword-keep-korean`.
   - **UI:** anything else.
2. **Replace the UI text** with English, using `docs/hwpword/glossary.md`. Change only the text inside the quotes or template literal. Keep `${…}` placeholders, punctuation that code splits on, IDs, `data-*` values and CSS classes unchanged.
3. **Multi-line `console.*` calls:** if a flagged line is the continuation of one, translate it too (log text is cheap to translate).
4. **`index.html`:**
   - Translate only between `<div id="style-bar">` and `</footer>`: labels, `title`, `aria-label` and `<option>` text. For example, `<option value="0">바탕글</option>` becomes `<option value="0">Normal</option>`, and the status bar `1 / 1 쪽` becomes `Page 1 of 1`.
   - Leave `value="…"` attributes unchanged.
   - Leave font-name options unchanged; the guard already allows them.
5. **Status-bar formats in `main.ts`** (`… 쪽`, `구역: …`, `삽입`/`수정`) become `Page X of Y`, `Section: X / Y`, `Insert`/`Overtype`.
6. **`about-dialog.ts`:**
   - Title `제품 정보` → `About HWP Word`.
   - `HWP 오픈소스 편집` → `Built on rhwp, the open-source HWP editor`.
   - `오픈소스 라이선스` → `Open-source licenses`.
   - Keep the attribution sentence exactly as it is.

Rerun `cd rhwp-studio && node --test tests/hwpword-english-ui.test.ts; cd ..` until it passes.

- [ ] **Step 5: Update upstream tests that pinned the old strings**

```bash
(cd rhwp-studio && npm test > ../corpus/studio-test.tap 2>&1); grep -E "^not ok " corpus/studio-test.tap
```
For each `not ok` file **not** in the baseline:
1. Open the test and find the failing assertion (search the TAP output for `not ok` and `expected`).
2. If it asserts a Korean string that this task translated, change the expected value to the new English string. Change nothing else in that test.
3. If it fails for any other reason, the translation changed behaviour. Fix the source change instead.

Rerun until the `not ok` lines equal the baseline.

- [ ] **Step 6: Check in the app**

```bash
npm --prefix desktop run build:studio
npm --prefix desktop start -- ../corpus/spike/ribbon-test.hwp
```
Expected, all in English:
- the formatting bar labels and tooltips
- the status bar (`Page 1 of N`, `Section: 1 / 1`, `Insert`)
- **File → Save As** dialog, **File → Save as PDF** guidance dialog, **File → About** (with the Korean attribution sentence still present)
- dialog buttons **OK / Cancel**
- the unsaved-changes dialog

Also open a password-protected HWP if one is available; the password dialog must be English.

- [ ] **Step 7: Commit**

```bash
git add docs/hwpword/glossary.md rhwp-studio/tests rhwp-studio/index.html rhwp-studio/src
git commit -m "Translate the editor shell to English with a guard test and glossary" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Translate the format dialogs

**Files:**
- Modify: `rhwp-studio/tests/hwpword-english-ui.test.ts` (append to `ENGLISH_UI_SOURCES`)
- Modify: strings in `rhwp-studio/src/ui/char-shape-dialog.ts`, `rhwp-studio/src/ui/para-shape-dialog.ts`, `rhwp-studio/src/ui/para-shape-tab-builders.ts`, `rhwp-studio/src/ui/style-dialog.ts`, `rhwp-studio/src/ui/style-edit-dialog.ts`
- Modify: upstream tests pinning strings changed here

**Interfaces:**
- Consumes: from Task 8, `ENGLISH_UI_SOURCES` and the glossary.
- Produces: the same list, extended.

- [ ] **Step 1: Extend the guard (failing)**

In `rhwp-studio/tests/hwpword-english-ui.test.ts`, add these entries at the end of the `ENGLISH_UI_SOURCES` array:
```ts
  'src/ui/char-shape-dialog.ts',
  'src/ui/para-shape-dialog.ts',
  'src/ui/para-shape-tab-builders.ts',
  'src/ui/style-dialog.ts',
  'src/ui/style-edit-dialog.ts',
```
Run: `cd rhwp-studio && node --test tests/hwpword-english-ui.test.ts; cd ..`
Expected: FAIL, listing roughly 190 lines across the five files.

- [ ] **Step 2: Translate every listed line**

Follow Task 8 Step 4, points 1–3, and the glossary. Dialog titles: `글자 모양` → `Character Format`, `문단 모양` → `Paragraph Format`, `스타일` → `Styles`. Tab names inside the dialogs are Title Case (`Basic`, `Extended`, `Borders`, `Tabs`). Rerun the guard until it passes.

- [ ] **Step 3: Update pinned upstream tests**

Follow Task 8 Step 5 exactly. Expected: the `not ok` lines equal the baseline.

- [ ] **Step 4: Check in the app**

```bash
npm --prefix desktop run build:studio
npm --prefix desktop start -- ../corpus/spike/ribbon-test.hwp
```
- **Home → Character…:** every tab, label, unit and button is English. Change the character spacing of a selected word, then **OK**. **Expected:** it applies.
- **Home → Paragraph…:** every tab is English. Set **Space After** to `10`, then **OK**. **Expected:** it applies.
- **Home → Styles…:** English. Open the style edit sub-dialog; also English. Document style names (e.g. `바탕글`) stay as they are in the document.

- [ ] **Step 5: Commit**

```bash
git add rhwp-studio/tests rhwp-studio/src/ui
git commit -m "Translate character, paragraph and style dialogs to English" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Translate the page, table and find dialogs

**Files:**
- Modify: `rhwp-studio/tests/hwpword-english-ui.test.ts` (append)
- Modify: strings in `rhwp-studio/src/ui/page-setup-dialog.ts`, `rhwp-studio/src/ui/table-create-dialog.ts`, `rhwp-studio/src/ui/table-cell-props-dialog.ts`, `rhwp-studio/src/ui/find-dialog.ts`, `rhwp-studio/src/ui/goto-dialog.ts`
- Modify: upstream tests pinning strings changed here

**Interfaces:**
- Consumes: from Task 8, `ENGLISH_UI_SOURCES` and the glossary.
- Produces: the same list, extended.

- [ ] **Step 1: Extend the guard (failing)**

Append to `ENGLISH_UI_SOURCES`:
```ts
  'src/ui/page-setup-dialog.ts',
  'src/ui/table-create-dialog.ts',
  'src/ui/table-cell-props-dialog.ts',
  'src/ui/find-dialog.ts',
  'src/ui/goto-dialog.ts',
```
Run: `cd rhwp-studio && node --test tests/hwpword-english-ui.test.ts; cd ..`
Expected: FAIL, listing roughly 200 lines.

- [ ] **Step 2: Translate every listed line**

Follow Task 8 Step 4, points 1–3, and the glossary.
- **Paper size names:** `A4`, `B5`, `Letter` stay as they are; Korean-only names like `국배판` get the English description plus the size, e.g. `Gukbae (210 × 297 mm)`.
- **Find dialog:** strings used to match search options must be checked with grep as described in Task 8.

Rerun the guard until it passes.

- [ ] **Step 3: Update pinned upstream tests**

Follow Task 8 Step 5 exactly. Expected: the `not ok` lines equal the baseline.

- [ ] **Step 4: Check in the app**

```bash
npm --prefix desktop run build:studio
npm --prefix desktop start -- ../corpus/spike/ribbon-test.hwp
```
- **Layout → Page Setup…:** English. Switch to Landscape, then **OK**. **Expected:** the page becomes landscape. Undo with **Ctrl+Z**.
- **Insert → Table:** the dialog is English; create a 3×3 table.
- **Layout → Table Properties…** with the caret in the table: English on every tab.
- **Home → Find** and **Replace:** English. Replace one word successfully.
- **Home → Go To:** English. Go to page 1.

- [ ] **Step 5: Commit**

```bash
git add rhwp-studio/tests rhwp-studio/src/ui
git commit -m "Translate page setup, table and find dialogs to English" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Translate command labels (right-click menu and command palette)

The right-click menu on tables is a primary surface for editing forms, and it shows `CommandDef.label` text.

**Files:**
- Modify: `rhwp-studio/tests/hwpword-english-ui.test.ts` (append)
- Modify: strings in `rhwp-studio/src/command/commands/edit.ts`, `format.ts`, `insert.ts`, `page.ts`, `table.ts`, `tool.ts`, `view.ts` (`file.ts` was done in Task 8)
- Modify: upstream tests pinning strings changed here

**Interfaces:**
- Consumes: from Task 8, `ENGLISH_UI_SOURCES` and the glossary.
- Produces: the same list, extended.

- [ ] **Step 1: Extend the guard (failing)**

Append to `ENGLISH_UI_SOURCES`:
```ts
  'src/command/commands/edit.ts',
  'src/command/commands/format.ts',
  'src/command/commands/insert.ts',
  'src/command/commands/page.ts',
  'src/command/commands/table.ts',
  'src/command/commands/tool.ts',
  'src/command/commands/view.ts',
```
Run: `cd rhwp-studio && node --test tests/hwpword-english-ui.test.ts; cd ..`
Expected: FAIL, listing roughly 220 lines.

- [ ] **Step 2: Translate every listed line**

Follow Task 8 Step 4, points 1–3, and the glossary.
- **Labels:** in `label:` values, drop Hancom's mnemonic suffixes such as `(F)` and `(E)`, and keep `...`/`…` for dialog commands. For example, `찾기(F)` → `Find…` and `표/셀 속성` → `Table Properties…`.
- **Toast and error messages:** these also live in these files; translate them in sentence case.

Rerun the guard until it passes.

- [ ] **Step 3: Update pinned upstream tests**

Follow Task 8 Step 5 exactly. Expected: the `not ok` lines equal the baseline.

- [ ] **Step 4: Check in the app**

```bash
npm --prefix desktop run build:studio
npm --prefix desktop start -- ../corpus/spike/ribbon-test.hwp
```
- Right-click inside a table cell. **Expected:** the context menu is English (`Insert Row Above`, `Merge Cells`, …). Use one entry; it works.
- Right-click in normal text. **Expected:** English.
- Open the command palette with its shortcut (see `src/command/shortcut-map.ts`, `CommandPalette`) and type `table`. **Expected:** English entries.

- [ ] **Step 5: Commit**

```bash
git add rhwp-studio/tests rhwp-studio/src/command/commands
git commit -m "Translate command labels for the context menu and command palette" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# Phase C — Validation

### Task 12: Corpus round-trip check

**Files:**
- Create: `desktop/test/corpus-report.test.mjs`
- Create: `desktop/corpus/lib/report.mjs`
- Create: `desktop/corpus/page/index.html`
- Create: `desktop/corpus/page/runner.mjs`
- Create: `desktop/corpus/run.mjs`
- Modify: `desktop/package.json` (add `corpus` script)

**Interfaces:**
- Consumes:
  - from Task 3: `resolveAppPath`
  - from `@rhwp/core`:
    - `new HwpDocument(bytes)` and `free()`
    - `pageCount()`, `getSectionCount()`, `getPageText(i)`, `renderPageSvg(i)`
    - `getSourceFormat()` and `getDocumentInfo()`, which returns JSON with `fontsUsed`
    - `exportHwpWithReport()` / `exportHwpxWithReport()`, returning a `DocumentExport` with `contentLoss()`, `takeBytes()` and `free()`
- Produces:
  - `normalizeText(pageTexts: string[]): string`
  - `compareRoundTrip(before, after): { textEqual, pagesEqual, sectionsEqual }`
  - `lossCount(json: string): number | null`
  - `toMarkdown(results, generatedAt): string`
  - `npm --prefix desktop run corpus [-- <dir>]`, which writes `corpus/report-<dir name>.md`

- [ ] **Step 1: Write the failing test**

`desktop/test/corpus-report.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRoundTrip, lossCount, normalizeText, toMarkdown } from '../corpus/lib/report.mjs';

test('re-pagination alone is not a text difference', () => {
  const before = { pages: 2, sections: 1, pageTexts: ['Hello ', 'world\n'] };
  const after = { pages: 1, sections: 1, pageTexts: ['Hello world'] };
  assert.equal(normalizeText(before.pageTexts), 'Helloworld');
  assert.deepEqual(compareRoundTrip(before, after), { textEqual: true, pagesEqual: false, sectionsEqual: true });
});

test('changed text is detected', () => {
  const before = { pages: 1, sections: 1, pageTexts: ['신청서 성명'] };
  const after = { pages: 1, sections: 1, pageTexts: ['신청서'] };
  assert.equal(compareRoundTrip(before, after).textEqual, false);
});

test('loss count comes from the export report', () => {
  assert.equal(lossCount('{"count":2,"losses":[{},{}]}'), 2);
  assert.equal(lossCount('{"count":0,"losses":[]}'), 0);
  assert.equal(lossCount('not json'), null);
});

test('report counts problems and escapes table cells', () => {
  const md = toMarkdown([
    { file: 'ok.hwp', format: 'hwp', pages: 3, renderErrors: 0, textEqual: true, pagesEqual: true, sectionsEqual: true, lossCount: 0, missingFonts: [] },
    { file: 'bad|name.hwp', error: 'open: password required' },
    { file: 'drift.hwpx', format: 'hwpx', pages: 5, renderErrors: 1, textEqual: false, pagesEqual: false, sectionsEqual: true, lossCount: 1, missingFonts: ['함초롬바탕'] },
  ], '2026-09-16T00:00:00.000Z');
  assert.match(md, /3 files, 2 with problems\./);
  assert.match(md, /\| ok\.hwp \| hwp \| 3 \| yes \| yes \| yes \| 0 \| — \|  \|/);
  assert.match(md, /\| bad\\\|name\.hwp \| — \| — \| — \| — \| — \| — \| — \| open: password required \|/);
  assert.match(md, /\| drift\.hwpx \| hwpx \| 5 \| \*\*1 failed\*\* \| \*\*NO\*\* \| \*\*NO\*\* \| 1 \| 함초롬바탕 \|  \|/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix desktop test`
Expected: FAIL with `Cannot find module …/corpus/lib/report.mjs`.

- [ ] **Step 3: Implement the report helpers**

`desktop/corpus/lib/report.mjs`:
```js
/** All page text with whitespace removed, so re-pagination after a save doesn't count as a text change. */
export function normalizeText(pageTexts) {
  return pageTexts.join('').replace(/\s+/g, '');
}

export function compareRoundTrip(before, after) {
  return {
    textEqual: normalizeText(before.pageTexts) === normalizeText(after.pageTexts),
    pagesEqual: before.pages === after.pages,
    sectionsEqual: before.sections === after.sections,
  };
}

/** `DocumentExport.contentLoss()` is JSON `{ count, losses }`; null when it can't be read. */
export function lossCount(contentLossJson) {
  try {
    const report = JSON.parse(contentLossJson);
    return typeof report.count === 'number' ? report.count : null;
  } catch {
    return null;
  }
}

const cell = (value) => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const verdict = (ok) => (ok ? 'yes' : '**NO**');

function row(r) {
  if (r.error) return `| ${cell(r.file)} | — | — | — | — | — | — | — | ${cell(r.error)} |`;
  const renders = r.renderErrors === 0 ? 'yes' : `**${r.renderErrors} failed**`;
  const fonts = r.missingFonts.length > 0 ? cell(r.missingFonts.join(', ')) : '—';
  return `| ${cell(r.file)} | ${r.format} | ${r.pages} | ${renders} | ${verdict(r.textEqual)} | ${verdict(r.pagesEqual)} | ${r.lossCount ?? '—'} | ${fonts} |  |`;
}

export function toMarkdown(results, generatedAt) {
  const problems = results.filter((r) => r.error || r.renderErrors > 0 || !r.textEqual || !r.pagesEqual).length;
  return [
    '# Corpus round-trip report',
    '',
    `Generated ${generatedAt}. ${results.length} files, ${problems} with problems.`,
    '',
    'Each file is opened, every page rendered, saved in its own format, reopened and compared.',
    '',
    '| File | Format | Pages | Renders OK | Text same after save | Pages same after save | Content-loss records | Missing fonts | Error |',
    '|---|---|---|---|---|---|---|---|---|',
    ...results.map(row),
    '',
  ].join('\n');
}
```

- [ ] **Step 4: Run the test**

Run: `npm --prefix desktop test`
Expected: `# fail 0`.

- [ ] **Step 5: Implement the runner page and the Electron entry**

`desktop/corpus/page/index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>HWP Word corpus check</title>
  </head>
  <body>
    <script type="module" src="./runner.mjs"></script>
  </body>
</html>
```

`desktop/corpus/page/runner.mjs`:
```js
import init, { HwpDocument } from '/core/rhwp.js';
import { compareRoundTrip, lossCount } from '/lib/report.mjs';

const ready = init();

function snapshot(doc) {
  const pages = doc.pageCount();
  const pageTexts = [];
  let renderErrors = 0;
  for (let i = 0; i < pages; i += 1) {
    pageTexts.push(doc.getPageText(i));
    try {
      doc.renderPageSvg(i);
    } catch {
      renderErrors += 1;
    }
  }
  return { pages, sections: doc.getSectionCount(), pageTexts, renderErrors };
}

/** Installed if text measured with the font differs from a generic fallback (same resolution rhwp's canvas uses). */
function isFontInstalled(name) {
  const ctx = document.createElement('canvas').getContext('2d');
  const sample = '한글 HWP 가나다라 0123';
  return ['monospace', 'serif'].some((generic) => {
    ctx.font = `32px ${generic}`;
    const fallback = ctx.measureText(sample).width;
    ctx.font = `32px "${name}", ${generic}`;
    return ctx.measureText(sample).width !== fallback;
  });
}

async function checkFile(name) {
  const result = { file: name };
  let stage = 'read';
  let doc;
  try {
    const response = await fetch(`/files/${encodeURIComponent(name)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());

    stage = 'open';
    doc = new HwpDocument(bytes);
    result.format = doc.getSourceFormat();
    const info = JSON.parse(doc.getDocumentInfo());
    result.missingFonts = (info.fontsUsed ?? []).filter((font) => !isFontInstalled(font));

    stage = 'render';
    const before = snapshot(doc);
    result.pages = before.pages;
    result.renderErrors = before.renderErrors;

    stage = 'save';
    const exported = result.format === 'hwpx' ? doc.exportHwpxWithReport() : doc.exportHwpWithReport();
    result.lossCount = lossCount(exported.contentLoss());
    const saved = exported.takeBytes();
    exported.free();

    stage = 'reopen';
    const reopened = new HwpDocument(saved);
    try {
      Object.assign(result, compareRoundTrip(before, snapshot(reopened)));
    } finally {
      reopened.free();
    }
  } catch (error) {
    result.error = `${stage}: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    doc?.free();
  }
  return result;
}

window.runCorpus = async (names) => {
  await ready;
  const results = [];
  for (const name of names) {
    results.push(await checkFile(name));
    console.log(`[corpus] ${results.length}/${names.length} ${name}`);
  }
  return results;
};
```

`desktop/corpus/run.mjs`:
```js
// `npm run corpus [-- <dir>]`: opens every .hwp/.hwpx/.hml in <dir> (default: <repo>/corpus) in a hidden
// window, renders, saves, reopens and compares each one with @rhwp/core, and writes corpus/report-<dir>.md.
import { app, BrowserWindow, net, protocol } from 'electron';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveAppPath } from '../lib/app-path.mjs';
import { toMarkdown } from './lib/report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoCorpusDir = join(here, '..', '..', 'corpus');
const corpusDir = resolve(process.argv.slice(2).find((arg) => !arg.startsWith('-') && !arg.endsWith('.mjs')) ?? repoCorpusDir);
const ROOTS = [
  ['/core/', join(here, '..', 'node_modules', '@rhwp', 'core')],
  ['/files/', corpusDir],
  ['/lib/', join(here, 'lib')],
  ['/', join(here, 'page')],
];

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function serve(request) {
  const { pathname } = new URL(request.url);
  const [prefix, root] = ROOTS.find(([candidate]) => pathname.startsWith(candidate));
  const filePath = resolveAppPath(root, `app://corpus/${pathname.slice(prefix.length)}`, 'corpus');
  return filePath ? net.fetch(pathToFileURL(filePath).toString()) : new Response('Not found', { status: 404 });
}

app.whenReady().then(async () => {
  protocol.handle('app', serve);
  const names = readdirSync(corpusDir).filter((name) => /\.(hwp|hwpx|hml)$/i.test(name)).sort();
  if (names.length === 0) {
    console.error(`No .hwp/.hwpx/.hml files in ${corpusDir}`);
    app.exit(1);
    return;
  }
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  win.webContents.on('console-message', (event) => console.log(event.message));
  await win.loadURL('app://corpus/index.html');
  const results = await win.webContents.executeJavaScript(`window.runCorpus(${JSON.stringify(names)})`);
  mkdirSync(repoCorpusDir, { recursive: true });
  const reportPath = join(repoCorpusDir, `report-${basename(corpusDir)}.md`);
  writeFileSync(reportPath, toMarkdown(results, new Date().toISOString()));
  console.log(`Wrote ${reportPath}`);
  app.quit();
});
```

In `desktop/package.json`, add to `"scripts"`:
```json
    "corpus": "electron corpus/run.mjs",
```

- [ ] **Step 6: Run it on a small real set**

```bash
mkdir -p corpus/smoke
cp "$(ls samples/*.hwp | head -1)" "$(ls samples/*.hwpx | head -1)" corpus/smoke/
printf 'not a document' > corpus/smoke/broken.hwp
npm --prefix desktop run corpus -- ../corpus/smoke
cat corpus/report-smoke.md
```
- **Expected, run:** it prints `[corpus] 1/3 …` through `3/3`, then `Wrote …report-smoke.md`, and exits.
- **Expected, report:** three rows.
  - `broken.hwp` shows an `open: …` error.
  - The two real files show pages > 0 and `Renders OK` = yes.
  - If `Text same after save` shows **NO** for a sample, note it for the user as an engine finding. It is not a runner bug.

- [ ] **Step 7: Commit**

```bash
git add desktop/corpus desktop/test/corpus-report.test.mjs desktop/package.json
git commit -m "Add corpus round-trip check that writes a Markdown report" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: MVP acceptance (with the user)

This task produces no code. It checks the spec's definition of done (§8) against the user's real documents. Results stay in `corpus/`, which is personal and gitignored.

- [ ] **Step 1: Prerequisites (user)**

1. Install the **함초롬바탕 / 함초롬돋움** fonts (free download from Hancom).
2. Install **Hancom Office Viewer** from https://www.hancom.com/product/office/officeViewer.
3. Copy about 10 representative documents into `corpus/`:
   - table-heavy forms
   - documents with images
   - documents with headers/footers
   - a long document (50+ pages)
   - a 배포용 (distribution) document, if available
   - at least one `.hwpx`

- [ ] **Step 2: Fresh installer**

```bash
npm --prefix desktop test
(cd rhwp-studio && npm test > ../corpus/studio-test.tap 2>&1); grep -E "^not ok " corpus/studio-test.tap
npm --prefix desktop run dist
```
Expected:
- the desktop tests pass
- the studio `not ok` lines equal the baseline
- the installer is built

The user installs it over the previous version.

- [ ] **Step 3: Corpus report (DoD 2 and 3)**

```bash
npm --prefix desktop run corpus
cat corpus/report-corpus.md
```
Review the report with the user.
- **DoD 2:** every file either renders, or has an error that explains why (password, unsupported).
- **DoD 3:** `Text same after save` = yes for every file that opened.

Record any **NO** rows as findings.

- [ ] **Step 4: Hancom acceptance (DoD 4)**

For each corpus file:
1. Copy it to `corpus/acceptance/`.
2. Double-click the copy to open it in HWP Word.
3. Edit one table cell and one paragraph, then **Ctrl+S**, then close.
4. Open the copy in **Hancom Office Viewer**. Record in `corpus/acceptance.md`: opens without error (yes/no), layout matches the original (yes/no/notes).

Repeat once with **File → Save as HWPX** on one file, and open the result in the Viewer.

- [ ] **Step 5: Print and UI (DoD 1, 5, 6)**

1. **Printing:** from the installed app, **File → Print** → **Microsoft Print to PDF** on a multi-page form. The PDF must match the on-screen pages.
2. **UI:** confirm the ribbon's Home, Insert, Layout and View basics, and that the dialogs they open are in English.

- [ ] **Step 6: Report**

Summarise for the user:
- DoD items 1–6, each pass or fail
- the corpus findings
- the Viewer results

For each failure, propose a follow-up: an upstream rhwp issue if it is an engine bug, or a new task. Do not commit `corpus/` contents.
