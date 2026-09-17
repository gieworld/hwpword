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
  assert.deepEqual(text.filter((label) => /[가-힣]/.test(label)), []);
});
