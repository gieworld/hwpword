# Building the engine

This fork no longer runs purely on the prebuilt `@rhwp/core` from npm. Page numbering needed engine
APIs upstream does not export, so `pkg/` is now built from the Rust sources in this repo.

`pkg/` is gitignored, so a fresh clone has no engine until you build one (or sync the npm copy).

## Build it

    npm --prefix desktop run build:engine

That runs upstream's `scripts/wasm-pack-locked.sh` (`--target web --out-dir pkg`), which pins
`--locked` through wasm-pack's own cargo calls so a build never rewrites `Cargo.lock`. First build
takes about 15 minutes (3 min of Rust, the rest wasm-bindgen and wasm-opt); later ones are shorter.

It finishes by writing `pkg/.built-locally`, which is how `sync-core` knows to leave the engine
alone — `build:studio` runs `sync-core` first, and without that marker it would copy the npm build
over ours and the page-number APIs would vanish.

To go back to the npm engine (it has no page-number APIs, so the dialog will fail):

    npm --prefix desktop run sync-core -- --force

## What it needs

- **Rust 1.93.1** — pinned by `rust-toolchain.toml`, so `rustup` installs it on first use.
- **wasm-pack 0.15.0** — pinned by upstream: `cargo install wasm-pack --version 0.15.0 --locked`.
- **MSVC build tools + Windows SDK** — for the host-side build scripts and proc macros.
- **The full workspace on disk.** The checkout is sparse; the Rust build needs `crates`,
  `examples`, `tests`, `benches`, `saved` and `bindings/Native` as well as `src`. `git
  sparse-checkout add <dir>` for anything a build reports missing.

## Two traps worth remembering

**PowerShell kills the build.** `scripts/wasm-pack-locked.ps1` sets `$ErrorActionPreference =
'Stop'`, and wasm-pack writes its `[INFO]` progress to stderr, which PowerShell 5.1 turns into a
terminating error on the first line. The build dies at "Checking for the Wasm target..." with no
real error. Use the `.sh` wrapper from Git Bash — that is what `build:engine` does.

**A half-installed wasm target looks installed.** `rustup show` listed
`wasm32-unknown-unknown` while
`~/.rustup/toolchains/<toolchain>/lib/rustlib/wasm32-unknown-unknown/lib` was empty, and every
crate failed with "can't find crate for `core`... the target may not be installed" even though
`rustup target add` answered "up to date". Check that directory has `.rlib` files; if it is empty:

    rustup component remove rust-std --target wasm32-unknown-unknown --toolchain 1.93.1-x86_64-pc-windows-msvc
    rustup component add    rust-std --target wasm32-unknown-unknown --toolchain 1.93.1-x86_64-pc-windows-msvc

## Our engine patch

One change, in two places, both written to match the code already beside them:

- `src/document_core/commands/formatting.rs` — `get_page_number_pos_native` /
  `set_page_number_pos_native`, next to the `set_page_hide_native` they are modelled on.
- `src/wasm_api.rs` — `getPageNumberPos` / `setPageNumberPos`.

Everything else about page numbering was already there: the `PageNumberPos` model, the parser, the
renderer (all nine HWP number formats) and the serializer that writes the control back into the
`.hwp`. Only the mutation path was missing.

When merging a new rhwp tag, re-apply this patch (or rebase it), rebuild, and re-run
`tests/hwpword-page-number-dialog.test.ts` — it pins the engine-side contract from the studio side.
