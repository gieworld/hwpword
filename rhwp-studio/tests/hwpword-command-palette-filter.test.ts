import test from 'node:test';
import assert from 'node:assert/strict';
import { isPaletteCommandHidden } from '../src/ui/command-palette-filter.ts';

test('skin and toolbox commands are hidden from the palette only in the desktop app', () => {
  assert.equal(isPaletteCommandHidden('view:skin-oldschool', true), true);
  assert.equal(isPaletteCommandHidden('view:toolbox-basic', true), true);
  assert.equal(isPaletteCommandHidden('view:toolbox-format', true), true);
  assert.equal(isPaletteCommandHidden('view:skin-oldschool', false), false);
  assert.equal(isPaletteCommandHidden('view:toolbox-basic', false), false);
});

test('other view: commands and unrelated commands stay visible everywhere', () => {
  assert.equal(isPaletteCommandHidden('view:zoom-100', true), false);
  assert.equal(isPaletteCommandHidden('view:para-mark', true), false);
  assert.equal(isPaletteCommandHidden('file:save', true), false);
  assert.equal(isPaletteCommandHidden('file:save', false), false);
});
