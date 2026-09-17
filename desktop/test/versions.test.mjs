import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readJson = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));

test('@rhwp/core is pinned to the rhwp-studio version we merged', () => {
  const desktop = readJson('../package.json');
  const studio = readJson('../../rhwp-studio/package.json');
  assert.equal(desktop.devDependencies['@rhwp/core'], studio.version);
});
