import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LaunchFileRegistry, launchPathsFromArgv, writeFileAtomic } from '../lib/launch-files.mjs';

test('picks existing document paths out of argv', () => {
  const missing = resolve('C:/docs', 'missing.hwp');
  const exists = (path) => path !== missing;
  const argv = [
    'C:/Users/me/AppData/Local/Programs/HWP Word/HWP Word.exe',
    '--allow-file-access-from-files',
    '.',
    'a.hwp',
    'B.HWPX',
    'notes.txt',
    'missing.hwp',
    'c.hml',
  ];
  assert.deepEqual(launchPathsFromArgv(argv, 'C:/docs', exists), [
    resolve('C:/docs', 'a.hwp'),
    resolve('C:/docs', 'B.HWPX'),
    resolve('C:/docs', 'c.hml'),
  ]);
});

test('tokens only resolve for the window they were issued to', () => {
  const registry = new LaunchFileRegistry();
  registry.register(1, ['C:/docs/a.hwp']);
  registry.register(2, []);
  const [file] = registry.list(1);
  assert.equal(file.name, 'a.hwp');
  assert.equal(registry.pathFor(1, file.token), 'C:/docs/a.hwp');
  assert.equal(registry.pathFor(2, file.token), null);
  assert.equal(registry.pathFor(1, 'made-up-token'), null);
  registry.release(1);
  assert.equal(registry.pathFor(1, file.token), null);
  assert.deepEqual(registry.list(1), []);
});

test('atomic write replaces the file and leaves no temp file behind', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hwpword-'));
  const target = join(dir, 'doc.hwp');
  writeFileSync(target, 'old');
  await writeFileAtomic(target, new Uint8Array([110, 101, 119]));
  assert.equal(readFileSync(target, 'utf8'), 'new');
  assert.deepEqual(readdirSync(dir), ['doc.hwp']);
});
