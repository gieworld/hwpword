// Builds the WASM engine from the Rust sources in this repo into <repo>/pkg, replacing the
// prebuilt @rhwp/core copy. We carry engine patches (page numbering — see
// docs/hwpword/engine-build.md), so the npm build does not have everything the studio calls.
//
// Uses upstream's wrapper, which pins `--locked` through wasm-pack's own cargo calls so a build
// never rewrites Cargo.lock. The POSIX wrapper is the one that works here: PowerShell 5.1 turns
// wasm-pack's first [INFO] line (it writes progress to stderr) into a terminating error.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = join(desktopDir, '..');

const result = spawnSync(
  'bash',
  ['scripts/wasm-pack-locked.sh', '--target', 'web', '--out-dir', 'pkg'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? 'target/pr-review' },
  },
);

if (result.error) {
  console.error('[build-engine] could not run bash — Git Bash provides it on Windows:', result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

writeFileSync(
  join(repoRoot, 'pkg', '.built-locally'),
  `built from this repo's Rust sources on ${new Date().toISOString().slice(0, 10)}\n`,
);
console.log('[build-engine] pkg/ now holds the engine built from src/ — sync-core will leave it alone.');
