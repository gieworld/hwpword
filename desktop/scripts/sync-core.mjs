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
