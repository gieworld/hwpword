import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSerialWriter, LaunchFileRegistry, launchPathsFromArgv, pathKey, writeFileAtomic } from '../lib/launch-files.mjs';

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

test('case and relative-path spellings of one file share a key', () => {
  const key = pathKey(join(process.cwd(), 'Docs', 'Form.hwp'));
  assert.equal(pathKey('docs/FORM.HWP'), key);
  assert.equal(pathKey('./other/../DOCS/form.hwp'), key);
  assert.notEqual(pathKey('docs/form2.hwp'), key);
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

test('a temp write that fails part-way leaves no temp file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hwpword-'));
  const target = join(dir, 'doc.hwp');
  writeFileSync(target, 'old');
  async function* halfWritten() {
    yield new Uint8Array([1, 2, 3]);
    throw new Error('stream broke');
  }
  await assert.rejects(writeFileAtomic(target, halfWritten()), /stream broke/);
  assert.equal(readFileSync(target, 'utf8'), 'old');
  assert.deepEqual(readdirSync(dir), ['doc.hwp']);
});

test('overlapping saves of one file all succeed, the last queued bytes win, and no temp file is left', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hwpword-'));
  const target = join(dir, 'doc.hwp');
  writeFileSync(target, 'old');
  const save = createSerialWriter();
  await Promise.all([
    save(target, new Uint8Array(65536).fill(49)),
    save(target, new Uint8Array(1024).fill(50)),
    save(target, new Uint8Array([51])),
  ]);
  assert.equal(readFileSync(target, 'utf8'), '3');
  assert.deepEqual(readdirSync(dir), ['doc.hwp']);
});

test('the serial writer never overlaps writes to one path, and a failed save does not block the next', async () => {
  let active = 0;
  const order = [];
  const save = createSerialWriter(async (_path, bytes) => {
    active += 1;
    assert.equal(active, 1, 'writes overlapped');
    await new Promise((done) => setTimeout(done, 5));
    active -= 1;
    order.push(bytes);
    if (bytes === 'first') throw new Error('disk full');
  });
  const results = await Promise.allSettled([save('C:/Docs/a.hwp', 'first'), save('c:\\docs\\A.HWP', 'second')]);
  assert.deepEqual(results.map((result) => result.status), ['rejected', 'fulfilled']);
  assert.deepEqual(order, ['first', 'second']);
});
