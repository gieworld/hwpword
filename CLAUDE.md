# HWP Word

Personal Windows desktop editor for Korean HWP/HWPX documents with an English, Word-style UI.
It is a local fork of [rhwp](https://github.com/edwardkim/rhwp) (MIT), pinned to a release tag.

- Design: `docs/superpowers/specs/2026-09-16-hwpword-desktop-design.md`
- Plan: `docs/superpowers/plans/2026-09-16-hwpword-desktop-mvp.md`
- Translation glossary: `docs/hwpword/glossary.md`

## Layout

- `rhwp-studio/`: upstream web editor (TypeScript + Vite). The English UI reaches into it broadly —
  ~120 files under `src/` (most of them `src/ui/`, plus `src/command/`, `src/core/`, `src/engine/`,
  `src/view/`) and ~70 test files. There is no list of touched files any more; `git diff v0.8.6..HEAD --
  rhwp-studio/src` is the list. Nearly all of those edits are visible strings only. What is more than that:
  - Ours outright: `src/ui/ribbon.ts` + `src/ui/ribbon-data.ts` (the ribbon, mounted from `index.html`),
    `src/ui/display-names.ts` (English/romanized names for Korean fonts and styles),
    `src/ui/command-palette-filter.ts` (hides desktop-irrelevant commands),
    `src/core/engine-messages.ts` (`toEnglishMessage`, the one translation point for engine/OS error
    text — called from `src/ui/toast.ts`, the global `alert` wrapper in `src/main.ts`, and
    `reportSaveError` in `src/command/commands/file.ts`), `src/desktop/`, `src/styles/hwpword.css`
    (one import in `src/style.css`).
  - Logic hooks in upstream files: `src/main.ts` (desktop launch queue, ribbon, the skin-onboarding
    guard skipped on the desktop, the startup plan where `desktopStartupPlan` gates draft recovery and
    the blank document, the global `window.alert` wrapper, `setWindowTitle`);
    `src/command/commands/file.ts` (desktop save failures are rethrown instead of falling back to a
    download); `src/engine/input-handler.ts` (`performPaste` has a desktop branch that asks the main
    process for an OS-level paste).
  - `tests/support/source-guard.ts` (upstream) understands regex literals because our guards scan
    files that contain them.
- `desktop/`: our Electron app (main process, preload, installer, corpus check). It owns the
  `@rhwp/core` and Electron versions.
- `pkg/`: generated copy of `@rhwp/core` (gitignored). Refresh with `npm --prefix desktop run sync-core`.
- Everything else is upstream and is not edited (Rust sources, docs, other apps). The checkout is sparse
  (`git sparse-checkout list`); `mydocs/`, most of `tools/` and other rhwp apps are not on disk.
  `build-studio.mjs` copies the bundled fonts from `assets/fonts`, so that folder must stay in the sparse checkout.

## Commands (Node 22 LTS ≥ 22.18, Git Bash)

- Studio tests: `npm --prefix rhwp-studio test` (failures must be listed in `docs/hwpword/windows-test-baseline.md`)
- Desktop tests: `npm --prefix desktop test`
- Build studio for desktop: `npm --prefix desktop run build:studio`
- Run built app: `npm --prefix desktop start`
- Dev loop: `npm --prefix rhwp-studio run dev` in one terminal, `npm --prefix desktop run dev` in another
- Corpus round-trip check: `npm --prefix desktop run corpus` → `corpus/report-corpus.md`
- Visible-UI English check: `npm --prefix desktop run check:english` (needs `build:studio` first; launches the app over CDP and scans chrome/dialogs/menus for Hangul)
- Installer: `npm --prefix desktop run dist` → `desktop/dist/`

## Rules

- Never commit anything under `corpus/` (personal documents).
- UI text is English; follow `docs/hwpword/glossary.md`. Korean font/style *values* stay Korean (they
  must match what is inside the HWP file), but what the UI shows goes through `fontDisplayName` /
  `styleDisplayName` in `src/ui/display-names.ts`, so displayed names are English or romanized.
  Hancom's attribution sentence stays Korean, verbatim.
- Korean that is data and not UI needs a trailing `hwpword-keep-korean` comment on its line — that is
  the only thing `tests/hwpword-english-ui.test.ts` exempts.
- Write regexes as plain `/…/` literals. `tests/support/source-guard.ts` parses regex literals
  (quotes, `[...]` classes and braces inside them), so the old ``new RegExp(String.raw`…`)`` dance is
  gone; don't reintroduce it. Its contract is `tests/hwpword-source-guard-regex.test.ts`.
- Don't translate the hidden `#menu-bar` / `#icon-toolbar` markup in `rhwp-studio/index.html`.

## Upgrading rhwp

1. `git fetch --filter=blob:none upstream refs/tags/vX.Y.Z:refs/tags/vX.Y.Z`
2. `npm --prefix desktop run corpus`, then `cp corpus/report-corpus.md corpus/report-corpus.before.md` to keep
   the before-report (the next run overwrites it), then `git merge vX.Y.Z`.
3. On conflicts in `.claude/`, `.mcp.json`, `AGENTS.md` or `CLAUDE.md`, keep ours (`git rm` the upstream copy / `git checkout --ours CLAUDE.md`).
4. Set `@rhwp/core` to `X.Y.Z` in `desktop/package.json`, then `npm --prefix desktop install` and `npm --prefix desktop run build:studio`.
5. Run both test suites, the corpus check, and `npm --prefix desktop run check:english`; compare the reports.
6. A merge brings Korean strings back into files we had translated, so after resolving conflicts re-run the
   two static guards (`tests/hwpword-english-ui.test.ts`, `tests/hwpword-no-mnemonics.test.ts`) and
   `npm --prefix desktop run check:english` — the guards catch source regressions, the check catches
   runtime-composed text.
