import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDesktopLaunchQueue,
  installDesktopLaunchQueue,
  type DesktopFileBridge,
} from '../src/desktop/desktop-launch-queue.ts';
import { handlePwaLaunchFiles, type OpenDocumentBytesPayload } from '../src/command/pwa-file-handling.ts';
import { saveDocumentToFileSystem, type FileSystemFileHandleLike } from '../src/command/file-system-access.ts';

function fakeBridge(files: Record<string, { name: string; bytes: Uint8Array<ArrayBuffer> }>) {
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
