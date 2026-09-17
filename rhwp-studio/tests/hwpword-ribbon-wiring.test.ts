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
  // CSS requires @import statements to precede all other rules (a browser drops any
  // that don't, exactly as the production build's postcss step does) — so "loads last"
  // is checked among the @import lines themselves, not against the file's literal last line.
  const imports = source('src/style.css')
    .split('\n')
    .filter((line) => line.startsWith('@import '));
  assert.equal(imports.at(-1), "@import './styles/hwpword.css';");
  assert.match(source('src/styles/hwpword.css'), /#menu-bar,\s*#icon-toolbar\s*\{\s*display:\s*none !important;/);
});

test('ribbon buttons act on mousedown so the editor keeps its text selection', () => {
  const ribbon = codeOnly(source('src/ui/ribbon.ts'));
  assert.match(ribbon, /addEventListener\('mousedown', \(event\) => \{\s*if \(event\.button !== 0\) return;\s*event\.preventDefault\(\);/);
  // A distinct attribute keeps upstream's global [data-cmd] scanners from double-binding ribbon buttons.
  assert.doesNotMatch(ribbon, /dataset\.cmd\b/);
});

test('the desktop app skips the first-run skin prompt, which would fight the Word look', () => {
  assert.match(codeOnly(source('src/main.ts')), /if \(!isHwpWordDesktop\(\)\) maybeShowSkinOnboarding\(\);/);
});
