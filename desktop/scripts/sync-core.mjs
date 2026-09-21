// Copies the pinned @rhwp/core build into <repo>/pkg, where rhwp-studio's `@wasm` alias
// and tsconfig paths expect a local wasm-pack build. pkg/ is gitignored upstream.
//
// We also build that engine ourselves now (page numbering needed APIs upstream does not export —
// see docs/hwpword/engine-build.md), and build:studio runs this script first. Copying over a local
// build would silently drop those APIs, so a build marked as ours is kept unless --force says
// otherwise.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = dirname(dirname(fileURLToPath(import.meta.url)));
const coreDir = join(desktopDir, 'node_modules', '@rhwp', 'core');
const pkgDir = join(desktopDir, '..', 'pkg');
const FILES = ['rhwp.js', 'rhwp.d.ts', 'rhwp_bg.wasm', 'rhwp_bg.wasm.d.ts', 'package.json'];
const LOCAL_MARKER = join(pkgDir, '.built-locally');

const force = process.argv.includes('--force');
if (existsSync(LOCAL_MARKER) && !force) {
  const built = readFileSync(LOCAL_MARKER, 'utf8').trim();
  console.log(`Keeping the locally built engine in ${pkgDir} (${built}).`);
  console.log('Run `npm --prefix desktop run sync-core -- --force` to replace it with @rhwp/core.');
  process.exit(0);
}

mkdirSync(pkgDir, { recursive: true });
for (const file of FILES) copyFileSync(join(coreDir, file), join(pkgDir, file));
if (existsSync(LOCAL_MARKER)) rmSync(LOCAL_MARKER);
const { version } = JSON.parse(readFileSync(join(coreDir, 'package.json'), 'utf8'));
console.log(`Copied @rhwp/core ${version} to ${pkgDir}`);
