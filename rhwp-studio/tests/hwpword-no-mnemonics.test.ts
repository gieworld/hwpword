import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from './support/source-guard.ts';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

// Same exclusion list as hwpword-english-ui.test.ts's NON_UI_SOURCES: modules already
// confirmed to have no reachable DOM/toast/alert/status-bar sink.
const NON_UI_SOURCES = [
  'src/core/generated/',
  'src/core/hwp-constants.ts',
  'src/hwpctl/',
  'src/document-agent/',
  'src/automation/',
  'src/embed/',
  'src/plugin/',
  'src/core/rhwp-dev.ts',
  'src/core/subsecond-runtime.ts',
];

/** posix-relative `src/...` paths of every `.ts` file under src, sorted. */
function allStudioSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.ts')) out.push(relative(rootDir, full).split(sep).join('/'));
    }
  };
  walk(join(rootDir, 'src'));
  return out.sort();
}

/** Hancom-style mnemonic: a single capital letter in parentheses attached to a label, e.g. `Color(S):`. */
const MNEMONIC = /\([A-Z]\)/;

/**
 * Marks a line whose `(X)` is not a Hancom mnemonic — e.g. a numbering-format preview like
 * `(I) (A) (1)` that legitimately shows Roman/alphabetic numeral styles.
 */
const KEEP_MARKER = 'hwpword-keep-text';

function mnemonicLines(relativePath: string): string[] {
  const raw = readFileSync(join(rootDir, relativePath), 'utf8').split('\n');
  const code = codeOnly(raw.join('\n')).split('\n');
  return code.flatMap((line, index) => {
    if (raw[index].includes(KEEP_MARKER)) return [];
    return MNEMONIC.test(line) ? [`${relativePath}:${index + 1}: ${raw[index].trim()}`] : [];
  });
}

test('no Hancom-style (X) mnemonics remain in visible studio UI strings', () => {
  const files = allStudioSources().filter(
    (file) => !NON_UI_SOURCES.some((prefix) => file.startsWith(prefix)),
  );
  assert.deepEqual(files.flatMap(mnemonicLines), []);
});

test('the visible style bar and status bar in index.html carry no (X) mnemonics', () => {
  const html = readFileSync(join(rootDir, 'index.html'), 'utf8');
  const start = html.indexOf('<div id="style-bar">');
  const end = html.indexOf('</footer>');
  assert.ok(start > 0 && end > start, 'style bar / status bar markers not found in index.html');
  const offenders = html
    .slice(start, end)
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    // Attribute values are data, not visible text — strip them before the mnemonic check.
    .map((line) => line.replace(/\s[\w:-]+="[^"]*"/g, ''))
    .filter((line) => MNEMONIC.test(line))
    .map((line) => line.trim());
  assert.deepEqual(offenders, []);
});
