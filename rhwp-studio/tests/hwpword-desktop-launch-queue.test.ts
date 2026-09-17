import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createDesktopLaunchQueue,
  desktopStartupPlan,
  installDesktopLaunchQueue,
  isHwpWordDesktop,
  type DesktopFileBridge,
} from '../src/desktop/desktop-launch-queue.ts';
import { handlePwaLaunchFiles, type OpenDocumentBytesPayload } from '../src/command/pwa-file-handling.ts';
import { saveDocumentToFileSystem, type FileSystemFileHandleLike } from '../src/command/file-system-access.ts';
import { functionBodyFrom, codeOnly } from './support/source-guard.ts';

function fakeBridge(files: Record<string, { name: string; bytes: Uint8Array<ArrayBuffer> }>, onlyWindow = true) {
  const writes: Array<{ token: string; bytes: number[] }> = [];
  const bridge: DesktopFileBridge = {
    async getLaunchFiles() {
      return Object.entries(files).map(([token, file]) => ({ token, name: file.name }));
    },
    async readFile(token) {
      return files[token].bytes;
    },
    async writeFile(token, bytes) {
      writes.push({ token, bytes: [...bytes] });
    },
    async isOnlyWindow() {
      return onlyWindow;
    },
  };
  return { bridge, writes };
}

function launchedHandles(bridge: DesktopFileBridge): Promise<FileSystemFileHandleLike[]> {
  return new Promise((resolve) => {
    createDesktopLaunchQueue(bridge).setConsumer((params) => resolve(params.files ?? []));
  });
}

test('launched files open through the studio PWA launch path', async () => {
  const { bridge } = fakeBridge({ t1: { name: 'form.hwp', bytes: new Uint8Array([1, 2, 3]) } });
  const payloads: OpenDocumentBytesPayload[] = [];
  await handlePwaLaunchFiles({ files: await launchedHandles(bridge) }, {
    openDocumentBytes: (payload) => payloads.push(payload),
    notifyUnsupportedFile: (name) => assert.fail(`unsupported ${name}`),
    notifyError: (error) => assert.fail(String(error)),
  });
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].fileName, 'form.hwp');
  assert.deepEqual([...payloads[0].bytes], [1, 2, 3]);
});

test('Ctrl+S on a launched file writes the whole document back through the bridge', async () => {
  const { bridge, writes } = fakeBridge({ t1: { name: 'form.hwp', bytes: new Uint8Array([1]) } });
  const [handle] = await launchedHandles(bridge);
  const result = await saveDocumentToFileSystem({
    blob: new Blob([new Uint8Array([9, 8]), new Uint8Array([7])]),
    suggestedName: 'form.hwp',
    currentHandle: handle,
    windowLike: {},
    forceSaveAs: false,
    saveFormat: 'hwp',
  });
  assert.equal(result.method, 'current-handle');
  assert.deepEqual(writes, [{ token: 't1', bytes: [9, 8, 7] }]);
});

test('nothing launched means the consumer is never called', async () => {
  const { bridge } = fakeBridge({});
  let called = false;
  createDesktopLaunchQueue(bridge).setConsumer(() => {
    called = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(called, false);
});

test('launched handles report granted permission and identify themselves', async () => {
  const [handle] = await launchedHandles(fakeBridge({ t1: { name: 'a.hwpx', bytes: new Uint8Array() } }).bridge);
  assert.equal(await handle.queryPermission?.({ mode: 'readwrite' }), 'granted');
  assert.equal(await handle.requestPermission?.({ mode: 'readwrite' }), 'granted');
  assert.equal(await handle.isSameEntry?.(handle), true);
});

test('installs over the browser launchQueue getter, but only inside HWP Word', () => {
  const nativeQueue = { setConsumer() {} };
  class WindowBase {
    get launchQueue() {
      return nativeQueue;
    }
  }
  const browser = new WindowBase() as WindowBase & { hwpwordDesktop?: DesktopFileBridge };
  assert.equal(installDesktopLaunchQueue(browser), false);
  assert.equal(browser.launchQueue, nativeQueue);

  const desktop = Object.assign(new WindowBase(), { hwpwordDesktop: fakeBridge({}).bridge });
  assert.equal(installDesktopLaunchQueue(desktop), true);
  assert.notEqual(desktop.launchQueue, nativeQueue);
  assert.equal(typeof desktop.launchQueue.setConsumer, 'function');
});

test('a failed write rejects with a readable message and keeps the cause', async () => {
  const cause = new Error('EPERM: operation not permitted');
  const bridge: DesktopFileBridge = {
    async getLaunchFiles() { return [{ token: 't1', name: 'form.hwp' }]; },
    async readFile() { return new Uint8Array(); },
    async writeFile() { throw cause; },
    async isOnlyWindow() { return true; },
  };
  const [handle] = await launchedHandles(bridge);
  const writable = await handle.createWritable();
  await writable.write(new Blob([new Uint8Array([1])]));
  await assert.rejects(writable.close(), (error: Error) => {
    assert.equal(error.message, 'Could not save "form.hwp". It may be read-only or open in another program.');
    assert.equal(error.cause, cause);
    return true;
  });
});

test('isHwpWordDesktop is true only when the preload bridge exists', () => {
  assert.equal(isHwpWordDesktop({}), false);
  assert.equal(isHwpWordDesktop({ hwpwordDesktop: fakeBridge({}).bridge }), true);
});

test('desktop saves report write failures instead of falling back to a download', () => {
  const fileTs = codeOnly(readFileSync(new URL('../src/command/commands/file.ts', import.meta.url), 'utf8'));
  const body = functionBodyFrom(fileTs, 'async function tryFileSystemSave');
  assert.match(body, /if \(isUserCancelError\(error\)\) return 'cancelled';\s*if \(isHwpWordDesktop\(\)\) throw error;/);
});

test('startup plan outside HWP Word offers recovery as upstream does', async () => {
  assert.deepEqual(await desktopStartupPlan({}), { hasLaunchFiles: false, offerRecovery: true });
});

test('a window launched with a file neither offers recovery nor opens a blank document', async () => {
  const bridge = fakeBridge({ t1: { name: 'form.hwp', bytes: new Uint8Array() } }).bridge;
  assert.deepEqual(await desktopStartupPlan({ hwpwordDesktop: bridge }), { hasLaunchFiles: true, offerRecovery: false });
});

test('only the sole window without a launched file offers recovery', async () => {
  assert.deepEqual(
    await desktopStartupPlan({ hwpwordDesktop: fakeBridge({}, true).bridge }),
    { hasLaunchFiles: false, offerRecovery: true },
  );
  assert.deepEqual(
    await desktopStartupPlan({ hwpwordDesktop: fakeBridge({}, false).bridge }),
    { hasLaunchFiles: false, offerRecovery: false },
  );
});

test('studio startup follows the desktop startup plan', () => {
  const mainTs = codeOnly(readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'));
  assert.match(
    mainTs,
    /const plan = await desktopStartupPlan\(window as unknown as DesktopWindowLike\);\s*await loadFromUrlParam\(\);\s*if \(chromeMode !== 'embed' && plan\.offerRecovery\) await offerAutosaveRecoveryIfIdle\(\);\s*if \(!plan\.hasLaunchFiles\) await openBlankDocumentIfIdle\(\);/,
  );
});
