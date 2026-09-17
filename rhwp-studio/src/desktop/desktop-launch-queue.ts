import type {
  FileSystemFileHandleLike,
  FileSystemWritableFileStreamLike,
} from '../command/file-system-access.ts';
import type { LaunchQueueLike } from '../command/pwa-file-handling.ts';

/** Byte-level file bridge exposed by the HWP Word Electron preload as `window.hwpwordDesktop`. */
export interface DesktopFileBridge {
  getLaunchFiles(): Promise<Array<{ token: string; name: string }>>;
  readFile(token: string): Promise<Uint8Array<ArrayBuffer>>;
  writeFile(token: string, bytes: Uint8Array): Promise<void>;
}

export interface DesktopWindowLike {
  hwpwordDesktop?: DesktopFileBridge;
}

function createDesktopFileHandle(bridge: DesktopFileBridge, token: string, name: string): FileSystemFileHandleLike {
  const handle: FileSystemFileHandleLike = {
    kind: 'file',
    name,
    async getFile() {
      return new File([await bridge.readFile(token)], name);
    },
    async createWritable(): Promise<FileSystemWritableFileStreamLike> {
      const parts: Blob[] = [];
      return {
        async write(data: Blob) {
          parts.push(data);
        },
        async close() {
          await bridge.writeFile(token, new Uint8Array(await new Blob(parts).arrayBuffer()));
        },
      };
    },
    async isSameEntry(other) {
      return other === handle;
    },
    async queryPermission() {
      return 'granted';
    },
    async requestPermission() {
      return 'granted';
    },
  };
  return handle;
}

/** A `launchQueue` that hands the files Windows launched this window with to the studio's PWA open path. */
export function createDesktopLaunchQueue(bridge: DesktopFileBridge): LaunchQueueLike {
  return {
    setConsumer(consumer) {
      bridge
        .getLaunchFiles()
        .then((files) => {
          if (files.length === 0) return;
          consumer({ files: files.map((file) => createDesktopFileHandle(bridge, file.token, file.name)) });
        })
        .catch((error) => console.error('[hwpword] could not read launch files', error));
    },
  };
}

/** Replaces `window.launchQueue` when running inside HWP Word; a normal browser keeps its own. */
export function installDesktopLaunchQueue(win: DesktopWindowLike): boolean {
  if (!win.hwpwordDesktop) return false;
  // Chromium defines launchQueue as a getter on Window.prototype, so shadow it with an own property.
  Object.defineProperty(win, 'launchQueue', {
    value: createDesktopLaunchQueue(win.hwpwordDesktop),
    configurable: true,
  });
  return true;
}
