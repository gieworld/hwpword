// HWP Word main process: serves the rhwp-studio build over app://hwpword, keeps the renderer locked down,
// and hands files Windows launched us with to the studio through token-scoped IPC.
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell } from 'electron';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { originOf, resolveAppPath } from './lib/app-path.mjs';
import { createSerialWriter, LaunchFileRegistry, launchPathsFromArgv } from './lib/launch-files.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const APP_HOST = 'hwpword';
const APP_ORIGIN = `app://${APP_HOST}`;
const devUrlArg = process.argv.find((arg) => arg.startsWith('--dev-url='));
const DEV_URL = devUrlArg ? devUrlArg.slice('--dev-url='.length) : null;
const DEV_ORIGIN = DEV_URL ? originOf(DEV_URL) : null;
const STUDIO_DIST = app.isPackaged
  ? join(process.resourcesPath, 'studio')
  : join(here, '..', 'rhwp-studio', 'dist');
const launchFiles = new LaunchFileRegistry();
// Every window lives in this one process (single-instance lock), so quick repeated saves must queue per file.
const saveFile = createSerialWriter();

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
  ses.setPermissionRequestHandler((webContents, _permission, callback, details) => {
    callback(isTrustedUrl(details.requestingUrl || webContents.getURL()));
  });
  ses.setPermissionCheckHandler((_webContents, _permission, requestingOrigin) => isTrustedUrl(`${requestingOrigin}/`));
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
  win.on('page-title-updated', (event) => event.preventDefault());
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
  win.once('ready-to-show', () => win.show());
  if (DEV_URL) win.webContents.openDevTools({ mode: 'detach' });
  void win.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`);
  return win;
}

function openLaunchPaths(paths) {
  if (paths.length === 0) return false;
  for (const path of paths) createWindow([path]);
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
}

app.on('web-contents-created', (_event, contents) => {
  // Print preview opens print.html in a child window; anything else leaves the app.
  contents.setWindowOpenHandler(({ url }) => {
    if (isTrustedUrl(url) || url === 'about:blank') return { action: 'allow' };
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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    if (openLaunchPaths(launchPathsFromArgv(argv, workingDirectory))) return;
    const [existing] = BrowserWindow.getAllWindows();
    if (!existing) {
      createWindow();
      return;
    }
    if (existing.isMinimized()) existing.restore();
    existing.focus();
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
