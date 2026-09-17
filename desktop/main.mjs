// HWP Word main process: serves the rhwp-studio build over app://hwpword and keeps the renderer locked down.
import { app, BrowserWindow, dialog, Menu, net, protocol, session, shell } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { originOf, resolveAppPath } from './lib/app-path.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const APP_HOST = 'hwpword';
const APP_ORIGIN = `app://${APP_HOST}`;
const devUrlArg = process.argv.find((arg) => arg.startsWith('--dev-url='));
const DEV_URL = devUrlArg ? devUrlArg.slice('--dev-url='.length) : null;
const DEV_ORIGIN = DEV_URL ? originOf(DEV_URL) : null;
const STUDIO_DIST = app.isPackaged
  ? join(process.resourcesPath, 'studio')
  : join(here, '..', 'rhwp-studio', 'dist');

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

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'HWP Word',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
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

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const filePath = resolveAppPath(STUDIO_DIST, request.url, APP_HOST);
    if (!filePath) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
  hardenSession(session.defaultSession);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
