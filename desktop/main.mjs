// HWP Word main process: serves the rhwp-studio build over app://hwpword, keeps the renderer locked down,
// and hands files Windows launched us with to the studio through token-scoped IPC.
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell } from 'electron';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAllowedPermission, originOf, resolveAppPath } from './lib/app-path.mjs';
import { createSerialWriter, LaunchFileRegistry, launchPathsFromArgv, pathKey } from './lib/launch-files.mjs';
import { isAppTitle } from './lib/window-title.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const APP_HOST = 'hwpword';
const APP_ORIGIN = `app://${APP_HOST}`;
// The installed app always serves its bundled studio; --dev-url is for `npm run dev` only.
const devUrlArg = app.isPackaged ? undefined : process.argv.find((arg) => arg.startsWith('--dev-url='));
const DEV_URL = devUrlArg ? devUrlArg.slice('--dev-url='.length) : null;
const DEV_ORIGIN = DEV_URL ? originOf(DEV_URL) : null;
const STUDIO_DIST = app.isPackaged
  ? join(process.resourcesPath, 'studio')
  : join(here, '..', 'rhwp-studio', 'dist');
const launchFiles = new LaunchFileRegistry();
// Every window lives in this one process (single-instance lock), so quick repeated saves must queue per file.
const saveFile = createSerialWriter();
const windowsByPath = new Map();

// Service workers are deliberately not enabled for this scheme: no stale caches across installer upgrades.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

function isTrustedUrl(url) {
  const origin = originOf(url);
  return origin !== null && (origin === APP_ORIGIN || origin === DEV_ORIGIN);
}

function openExternally(url) {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function hardenSession(ses) {
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isAllowedPermission(permission) && isTrustedUrl(details.requestingUrl || webContents.getURL()));
  });
  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return isAllowedPermission(permission) && isTrustedUrl(`${requestingOrigin}/`);
  });
}

function createWindow(launchPaths = []) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'HWP Word',
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const ownerId = win.webContents.id;
  launchFiles.register(ownerId, launchPaths);
  win.on('closed', () => launchFiles.release(ownerId));
  // The studio sets document.title to "<document> - HWP Word" whenever it refreshes document
  // status; print briefly sets a bare basename title. Only the former should reach the window.
  win.on('page-title-updated', (event, title) => {
    if (!isAppTitle(title)) event.preventDefault();
  });
  // rhwp-studio registers beforeunload while the document is dirty; Electron would otherwise block the close silently.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'HWP Word',
      message: 'This document has unsaved changes.',
      detail: 'Close it without saving? Your changes will be lost.',
      buttons: ["Don't Save", 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (choice === 0) event.preventDefault();
  });
  // A crashed/killed renderer leaves this window blank forever unless something reloads it.
  // 'clean-exit' also fires for a normal quit/destroy, which needs no recovery dialog.
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    console.error(`[hwpword] renderer gone (reason=${details.reason}) for window ${win.id}`);
    // A crashed renderer can leave the window hidden (e.g. it died before 'ready-to-show'),
    // in which case a message box parented to it never appears.
    if (!win.isDestroyed() && !win.isVisible()) win.show();
    void dialog.showMessageBox(win, {
      type: 'warning',
      title: 'HWP Word',
      message: 'This window stopped working.',
      detail: `Reason: ${details.reason}. Unsaved changes in this window may be lost.`,
      buttons: ['Reload', 'Close'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }).then(({ response }) => {
      // The user (or another crash handler) may have already closed this window while the
      // dialog was up; reload()/destroy() on a destroyed BrowserWindow throws.
      if (win.isDestroyed()) return;
      if (response === 0) {
        // Launch tokens are keyed by webContents id, which reload() keeps, so the re-delivered
        // launch files still resolve.
        win.webContents.reload();
        return;
      }
      // The renderer process is already gone, so it can never run beforeunload; win.close()
      // would wait on that handshake forever. destroy() skips it while still guaranteeing the
      // 'closed' event, so the launchFiles/windowsByPath cleanup above still runs.
      win.destroy();
    });
  });
  win.once('ready-to-show', () => win.show());
  if (DEV_URL) win.webContents.openDevTools({ mode: 'detach' });
  void win.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`);
  return win;
}

function focusWindow(win) {
  if (win.isMinimized()) win.restore();
  win.focus();
}

/** One window per file: launching a file that is already open brings its window forward, so two editors never overwrite each other. */
function openLaunchPaths(paths) {
  if (paths.length === 0) return false;
  for (const path of paths) {
    const key = pathKey(path);
    const open = windowsByPath.get(key);
    if (open) {
      focusWindow(open);
      continue;
    }
    const win = createWindow([path]);
    windowsByPath.set(key, win);
    win.on('closed', () => {
      if (windowsByPath.get(key) === win) windowsByPath.delete(key);
    });
  }
  return true;
}

function registerIpc() {
  const ownerOf = (event) => {
    if (!isTrustedUrl(event.senderFrame?.url ?? '')) throw new Error('Untrusted sender');
    return event.sender.id;
  };
  const pathOf = (event, token) => {
    const path = launchFiles.pathFor(ownerOf(event), token);
    if (!path) throw new Error('Unknown file token');
    return path;
  };
  ipcMain.handle('hwpword:get-launch-files', (event) => launchFiles.list(ownerOf(event)));
  ipcMain.handle('hwpword:read-file', async (event, token) => new Uint8Array(await readFile(pathOf(event, token))));
  ipcMain.handle('hwpword:write-file', async (event, token, bytes) => {
    const path = pathOf(event, token);
    if (!(bytes instanceof Uint8Array)) throw new Error('Expected document bytes');
    await saveFile(path, bytes);
  });
  // Autosave drafts are shared by all windows; only a lone window may offer to recover them.
  ipcMain.handle('hwpword:is-only-window', (event) => {
    ownerOf(event);
    return BrowserWindow.getAllWindows().length === 1;
  });
  // The ribbon/context-menu Paste command can't use document.execCommand('paste') — Chromium
  // blocks it in Electron — so it asks the main process for an OS-level paste instead.
  ipcMain.handle('hwpword:paste', (event) => {
    ownerOf(event);
    event.sender.paste();
  });
}

app.on('web-contents-created', (_event, contents) => {
  // Print preview opens print.html in a child window; anything else leaves the app.
  contents.setWindowOpenHandler(({ url }) => {
    if (isTrustedUrl(url)) return { action: 'allow' };
    openExternally(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (isTrustedUrl(url)) return;
    event.preventDefault();
    openExternally(url);
  });
});

Menu.setApplicationMenu(null);

// Dev runs keep their own drafts and single-instance lock instead of sharing the installed app's.
if (!app.isPackaged) app.setPath('userData', `${app.getPath('userData')}-dev`);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    if (openLaunchPaths(launchPathsFromArgv(argv, workingDirectory))) return;
    const [existing] = BrowserWindow.getAllWindows();
    if (existing) focusWindow(existing);
    else createWindow();
  });

  app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      const filePath = resolveAppPath(STUDIO_DIST, request.url, APP_HOST);
      if (!filePath) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(filePath).toString());
    });
    hardenSession(session.defaultSession);
    registerIpc();
    if (!openLaunchPaths(launchPathsFromArgv(process.argv))) createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
