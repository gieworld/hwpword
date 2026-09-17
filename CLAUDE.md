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
