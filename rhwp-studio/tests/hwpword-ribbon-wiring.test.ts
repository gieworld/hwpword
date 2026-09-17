import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly, functionBodyFrom } from './support/source-guard.ts';

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

test('the ribbon refreshes button state on caret/selection moves, not just command-state-changed', () => {
  const ribbon = codeOnly(source('src/ui/ribbon.ts'));
  assert.match(ribbon, /eventBus\.on\('command-state-changed', \(\) => this\.scheduleRefresh\(\)\);/);
  assert.match(ribbon, /eventBus\.on\('cursor-rect-updated', \(\) => this\.scheduleRefresh\(\)\);/);
});

test('refreshStates mirrors upstream [data-cmd].active onto the ribbon button, only for real toggle commands', () => {
  const ribbon = codeOnly(source('src/ui/ribbon.ts'));
  // Most commands (Save, Paste, Undo, ...) also have a [data-cmd] element in the hidden classic
  // menu bar, but only these six are ever synced as a checked/pressed toggle upstream — everything
  // else must not get aria-pressed (a screen reader would otherwise call plain buttons "pressed").
  assert.match(
    ribbon,
    /TOGGLE_COMMAND_IDS = new Set\(\[\s*'view:para-mark',\s*'view:ctrl-mark',\s*'view:border-transparent',\s*'view:toggle-grid',\s*'view:toggle-clip',\s*'view:form-mode',\s*\]\);/,
  );
  const body = functionBodyFrom(ribbon, 'private refreshStates(): void');
  assert.match(body, /if \(TOGGLE_COMMAND_IDS\.has\(cmd\)\) \{/);
  assert.match(body, /document\.querySelector\(`\[data-cmd="\$\{cmd\}"\]`\)/);
  assert.match(body, /classList\.toggle\('active', active\)/);
  assert.match(body, /setAttribute\('aria-pressed', String\(active\)\)/);
});

test('recent documents on the File page open with the keyboard too', () => {
  const ribbon = codeOnly(source('src/ui/ribbon.ts'));
  const recent = ribbon.slice(ribbon.indexOf('private async renderRecent'));
  assert.match(recent, /item\.addEventListener\('click', \(\) => \{\s*this\.closeFilePage\(\);\s*this\.dispatcher\.dispatch\('file:open-recent', \{ id: doc\.id \}\);/);
  assert.doesNotMatch(recent, /item\.addEventListener\('mousedown'/);
});
