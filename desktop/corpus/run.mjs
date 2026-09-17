// `npm run corpus [-- <dir>]`: opens every .hwp/.hwpx/.hml in <dir> (default: <repo>/corpus) in a hidden
// window, renders, saves, reopens and compares each one with @rhwp/core, and writes corpus/report-<dir>.md.
import { app, BrowserWindow, net, protocol } from 'electron';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveAppPath } from '../lib/app-path.mjs';
import { toMarkdown } from './lib/report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoCorpusDir = join(here, '..', '..', 'corpus');
const corpusDir = resolve(process.argv.slice(2).find((arg) => !arg.startsWith('-') && !arg.endsWith('.mjs')) ?? repoCorpusDir);
const ROOTS = [
  ['/core/', join(here, '..', 'node_modules', '@rhwp', 'core')],
  ['/files/', corpusDir],
  ['/lib/', join(here, 'lib')],
  ['/', join(here, 'page')],
];

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function serve(request) {
  const { pathname } = new URL(request.url);
  const [prefix, root] = ROOTS.find(([candidate]) => pathname.startsWith(candidate));
  const filePath = resolveAppPath(root, `app://corpus/${pathname.slice(prefix.length)}`, 'corpus');
  return filePath ? net.fetch(pathToFileURL(filePath).toString()) : new Response('Not found', { status: 404 });
}

app.whenReady().then(async () => {
  protocol.handle('app', serve);
  const names = readdirSync(corpusDir).filter((name) => /\.(hwp|hwpx|hml)$/i.test(name)).sort();
  if (names.length === 0) {
    console.error(`No .hwp/.hwpx/.hml files in ${corpusDir}`);
    app.exit(1);
    return;
  }
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  win.webContents.on('console-message', (event) => console.log(event.message));
  await win.loadURL('app://corpus/index.html');
  const results = await win.webContents.executeJavaScript(`window.runCorpus(${JSON.stringify(names)})`);
  mkdirSync(repoCorpusDir, { recursive: true });
  const reportPath = join(repoCorpusDir, `report-${basename(corpusDir)}.md`);
  writeFileSync(reportPath, toMarkdown(results, new Date().toISOString()));
  console.log(`Wrote ${reportPath}`);
  app.quit();
});
