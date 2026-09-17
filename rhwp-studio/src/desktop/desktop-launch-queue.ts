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
  /** True when no other HWP Word window is open. */
  isOnlyWindow(): Promise<boolean>;
  /** OS-level paste into whichever element in this window currently has focus. */
  paste(): Promise<void>;
}

export interface DesktopWindowLike {
  hwpwordDesktop?: DesktopFileBridge;
}

/** True inside the HWP Word Electron app, where the preload exposes `window.hwpwordDesktop`. */
export function isHwpWordDesktop(win: DesktopWindowLike = globalThis as DesktopWindowLike): boolean {
  return win.hwpwordDesktop !== undefined;
}

/**
 * What the studio should do at startup. Autosave drafts are shared by every window, so only a lone window that was not
 * launched with a file offers recovery; a window with a launched file must not open a blank document while it loads.
 */
export async function desktopStartupPlan(win: DesktopWindowLike): Promise<{ hasLaunchFiles: boolean; offerRecovery: boolean }> {
  const bridge = win.hwpwordDesktop;
  if (!bridge) return { hasLaunchFiles: false, offerRecovery: true };
  const hasLaunchFiles = (await bridge.getLaunchFiles()).length > 0;
  return { hasLaunchFiles, offerRecovery: !hasLaunchFiles && await bridge.isOnlyWindow() };
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
          const bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
          try {
            await bridge.writeFile(token, bytes);
          } catch (error) {
            throw new Error(`Could not save "${name}". It may be read-only or open in another program.`, { cause: error });
          }
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
