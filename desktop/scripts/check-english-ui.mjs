// Runtime English-UI check: launches HWP Word (dev build or an installed --exe), drives it with
// puppeteer-core over CDP, and scans every reachable piece of chrome/dialog/menu text for Hangul.
// This catches what the static guard (rhwp-studio/tests/hwpword-english-ui.test.ts) can't: text
// composed at runtime and document-derived names. See docs/hwpword/... task-9 brief for the design.
//
// Usage:
//   node scripts/check-english-ui.mjs [sampleDocPath] [--exe <path-to-HWP-Word.exe>]
// Run from the repo root (or via `npm --prefix desktop run check:english`). Expects rhwp-studio/dist
// to already be built (`npm --prefix desktop run build:studio`).
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readdirSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = dirname(here);
const repoRoot = dirname(desktopDir);

// 'electron' resolves normally from desktop/scripts (desktop/node_modules is an ancestor lookup away).
const require = createRequire(import.meta.url);
// puppeteer-core only lives in rhwp-studio/node_modules, a sibling of desktop/ — not reachable by the
// normal upward node_modules search, so it needs a require anchored there instead.
const requireStudio = createRequire(new URL('../../rhwp-studio/package.json', import.meta.url));
const puppeteer = requireStudio('puppeteer-core');

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;

// Runtime-rendered Korean that is allowed, matching the static guard's own exceptions
// (rhwp-studio/tests/hwpword-english-ui.test.ts KOREAN_DATA / hwpword-keep-korean markers).
const ALLOWLIST = [
  // Hancom's required attribution sentence in the About dialog; immediately followed by its
  // English translation (rhwp-studio/src/ui/about-dialog.ts).
  '본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.',
  // Insert Symbol dialog: literal example characters marking a Unicode block's own code-point
  // range, not translatable UI text (rhwp-studio/src/ui/symbols-dialog.ts, hwpword-keep-korean).
  'Hangul Syllables (가~깋)',
  'Hangul Syllables (나~닣)',
  // Note Settings (endnote numbering) dialog: literal numbering-glyph previews for Korean-specific
  // ordinal styles — the actual glyphs those styles produce, same idea as showing "I,II,III" for
  // upperRoman (rhwp-studio/src/ui/endnote-shape-dialog.ts, hwpword-keep-korean).
  '가,나,다',
  'ㄱ,ㄴ,ㄷ',
  '일,이,삼',
];

function stripAllowlisted(text) {
  return ALLOWLIST.reduce((t, s) => t.split(s).join(''), text);
}

function findOffenders(texts) {
  return texts.filter((t) => HANGUL.test(stripAllowlisted(t)));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolvePort(port));
    });
  });
}

function resolveSampleDoc(argPath) {
  if (argPath) return join(process.cwd(), argPath);
  const defaultPath = join(repoRoot, 'corpus', 'spike', 'launch-test.hwp');
  if (existsSync(defaultPath)) return defaultPath;
  const samplesDir = join(repoRoot, 'samples');
  const first = readdirSync(samplesDir).find((f) => /\.hwpx?$/i.test(f));
  if (!first) throw new Error('No sample document found (checked corpus/spike/launch-test.hwp and samples/*.hwp)');
  const dir = mkdtempSync(join(tmpdir(), 'hwpword-check-english-'));
  const dest = join(dir, first);
  copyFileSync(join(samplesDir, first), dest);
  return dest;
}

function killTree(pid) {
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } catch (error) {
    console.error(`[check-english-ui] could not stop process tree for pid ${pid}: ${error.message}`);
  }
}

/** Waits for the CDP endpoint, but fails fast (with a clear reason) if the process exits first
 * instead of quietly running out the full timeout — e.g. another instance already holds the
 * single-instance lock, so this spawn just forwards argv and exits immediately. */
async function waitForCdp(port, child, timeoutMs = 30000) {
  let exitInfo = null;
  child.once('exit', (code, signal) => {
    exitInfo = { code, signal };
  });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exitInfo) {
      throw new Error(
        `Electron exited before CDP came up (code=${exitInfo.code}, signal=${exitInfo.signal}). ` +
          'Another HWP Word/Electron instance may already hold the single-instance lock — close it and retry.',
      );
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(300);
  }
  throw new Error(`Timed out waiting for CDP on port ${port}`);
}

/** Every visible piece of chrome text: body text (minus document-content/user-data subtrees),
 * title/aria-label/placeholder attributes, and <select> option text (never individually "visible"
 * but real UI copy once the dropdown opens). */
async function getVisibleText(page) {
  return page.evaluate(() => {
    // #scroll-container: the document canvas (rendered page content, allowed to be Korean).
    // .compare-inspector-content: the compare view's rendered document panes (same reason).
    // .ribbon-file-recent-item: real user filenames from disk, not translatable UI text.
    const EXCLUDE_SELECTOR = '#scroll-container, .compare-inspector-content, .ribbon-file-recent-item';
    const isVisible = (el) => {
      if (typeof el.checkVisibility === 'function') {
        return el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
      }
      return el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
    };
    const isExcluded = (el) => el.closest(EXCLUDE_SELECTOR) !== null;
    const out = [];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const el = node.parentElement;
      if (
        el &&
        el.tagName !== 'SCRIPT' &&
        el.tagName !== 'STYLE' &&
        el.tagName !== 'NOSCRIPT' &&
        !isExcluded(el) &&
        isVisible(el)
      ) {
        const text = node.textContent.trim();
        if (text) out.push(text);
      }
      node = walker.nextNode();
    }

    document.querySelectorAll('[title], [aria-label], [placeholder]').forEach((el) => {
      if (isExcluded(el) || !isVisible(el)) return;
      for (const attr of ['title', 'aria-label', 'placeholder']) {
        const value = el.getAttribute(attr);
        if (value) out.push(value);
      }
    });

    document.querySelectorAll('select option').forEach((opt) => {
      const select = opt.closest('select');
      if (!select || isExcluded(select) || !isVisible(select)) return;
      if (opt.textContent) out.push(opt.textContent);
    });

    return out;
  });
}

async function selectRibbonTab(page, tabId) {
  if (tabId === 'file') {
    await page.click('.ribbon-tab-file');
    await page.waitForSelector('.ribbon-file-page:not([hidden])', { timeout: 5000 });
    await sleep(200); // let the async recent-docs list render
    return;
  }
  await page.click(`.ribbon-tabs button[aria-controls="ribbon-panel-${tabId}"]`);
  await page.waitForSelector(`#ribbon-panel-${tabId}:not([hidden])`, { timeout: 5000 });
}

/** Every dialog here (ModalDialog, FindDialog, SymbolsDialog, CommandPalette, ContextMenu) captures
 * Escape at the document level and closes unconditionally on it — verified by reading each class.
 * Never send Enter/click a primary button here: that would run the command instead of cancelling. */
async function closeOverlay(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(150);
  await page
    .evaluate(() => {
      const btn = document.querySelector('.dialog-close, .dialog-btn:not(.dialog-btn-primary)');
      if (btn && btn.offsetParent !== null) btn.click();
    })
    .catch(() => {});
  await sleep(100);
}

/** Opens a ribbon/file-page command that opens a DOM dialog, snapshots its visible text, and closes
 * it. Ribbon buttons dispatch their command on 'mousedown' (Ribbon.renderButton), before the paired
 * mouseup of a real click would land — and for commands whose dialog is a full-viewport popup (e.g.
 * table:create's grid picker), that mouseup can land on the new popup's own click-to-dismiss overlay
 * and immediately close it. Dispatching only 'mousedown' sidesteps that. */
async function checkDialogCommand(page, tabId, cmd) {
  await selectRibbonTab(page, tabId);
  const sel = `[data-ribbon-cmd="${cmd}"]`;
  const handle = await page.$(sel);
  if (!handle) return { skipped: true, reason: 'button not present in this ribbon state' };
  const disabled = await page.$eval(sel, (el) => el.disabled).catch(() => true);
  if (disabled) return { skipped: true, reason: 'disabled (command not available in this context)' };
  await page.$eval(sel, (el) =>
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })),
  );
  await sleep(250);
  const texts = await getVisibleText(page);
  await closeOverlay(page);
  return { skipped: false, texts };
}

/** file:print-to-pdf shows a DOM guidance dialog first — but only when the "show guidance" user
 * preference is still true. If a prior session unchecked it, the command skips straight into
 * preparing a real print job (whose ModalDialog.hide() is a no-op mid-flight, so nothing here could
 * cancel it). Reading the persisted preference first (never writing it) avoids ever triggering that. */
async function checkPrintToPdf(page) {
  await selectRibbonTab(page, 'file');
  const guidanceEnabled = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('rhwp-settings');
      if (!raw) return true;
      const data = JSON.parse(raw);
      return data?.dialog?.showPdfPrintGuidance !== false;
    } catch {
      return true;
    }
  });
  const sel = '[data-ribbon-cmd="file:print-to-pdf"]';
  if (!guidanceEnabled) {
    await page.click('.ribbon-file-back').catch(() => {});
    return {
      skipped: true,
      reason: "PDF print guidance is disabled in this profile's persisted settings; skipped rather than risk a real print",
    };
  }
  const disabled = await page.$eval(sel, (el) => el.disabled).catch(() => true);
  if (disabled) {
    await page.click('.ribbon-file-back').catch(() => {});
    return { skipped: true, reason: 'disabled' };
  }
  await page.$eval(sel, (el) =>
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })),
  );
  await sleep(300);
  const texts = await getVisibleText(page);
  // Escape only — never Enter/the primary "Open Print Dialog" button, which would launch a real print.
  await page.keyboard.press('Escape');
  await sleep(150);
  return { skipped: false, texts };
}

async function clickBodyTextPoint(page) {
  const point = await page.evaluate(() => {
    const el = document.getElementById('scroll-container');
    // launch-test.hwp's first ~2500px of scroll is a cover-page table; 5000 lands in plain body
    // text (confirmed by an earlier task's CDP mapping of this same sample document).
    el.scrollTop = 5000;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 100) };
  });
  await page.mouse.click(point.x, point.y);
  await sleep(150);
  return point;
}

// Ribbon buttons whose command opens a DOM dialog (rhwp-studio CommandDef.opensDialog === true),
// cross-referenced against rhwp-studio/src/ui/ribbon-data.ts. table:create, table:cell-props and
// table:cell-split are driven separately below (they need an actual table to act on); file:print-to-pdf
// is driven separately above (see checkPrintToPdf).
//
// Skipped entirely — native OS pickers or the print dialog, per the task brief:
//   file:open, file:save, file:save-as, file:save-as-hwp, file:save-as-hwpx, file:print,
//   file:export-doc, file:export-html, insert:image, edit:compare-documents.
// Also skipped: file:new-doc — on this (unmodified-so-far) document it opens no dialog at all, and by
// the time this script has exercised anything else the document is no longer unmodified.
const DIALOG_COMMANDS = [
  { tab: 'home', cmd: 'format:char-shape' },
  { tab: 'home', cmd: 'format:para-shape' },
  { tab: 'home', cmd: 'format:style-dialog' },
  { tab: 'home', cmd: 'edit:find' },
  { tab: 'home', cmd: 'edit:find-replace' },
  { tab: 'home', cmd: 'edit:goto' },
  { tab: 'insert', cmd: 'insert:equation' },
  { tab: 'insert', cmd: 'insert:field' },
  { tab: 'insert', cmd: 'insert:symbols' }, // default block is Basic Latin — no Hangul-block char grid shown
  { tab: 'insert', cmd: 'insert:bookmark' },
  { tab: 'layout', cmd: 'page:setup' },
  { tab: 'layout', cmd: 'page:page-border' },
  { tab: 'layout', cmd: 'page:new-page-num' },
  { tab: 'layout', cmd: 'page:col-settings' },
  { tab: 'layout', cmd: 'page:section-settings' },
  // Needs a picture or table selected as an object; expected to report "skipped: disabled" here.
  { tab: 'layout', cmd: 'format:object-properties' },
  { tab: 'references', cmd: 'insert:endnote-shape' },
  { tab: 'review', cmd: 'edit:document-history' },
  { tab: 'view', cmd: 'view:zoom-dialog' },
  { tab: 'view', cmd: 'view:grid-settings' },
  { tab: 'file', cmd: 'tool:options' },
  { tab: 'file', cmd: 'file:about' },
];

async function main() {
  const argv = process.argv.slice(2);
  let exePath = null;
  let samplePathArg = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--exe') {
      exePath = argv[++i];
    } else if (!argv[i].startsWith('--')) {
      samplePathArg = argv[i];
    }
  }
  const samplePath = resolveSampleDoc(samplePathArg);
  const port = await getFreePort();

  console.log(`[check-english-ui] sample document: ${samplePath}`);
  console.log(`[check-english-ui] CDP port: ${port}`);
  console.log(`[check-english-ui] target: ${exePath ?? 'electron . (dev build)'}`);

  const child = exePath
    ? spawn(exePath, [`--remote-debugging-port=${port}`, samplePath], { stdio: 'inherit' })
    : spawn(require('electron'), ['.', `--remote-debugging-port=${port}`, samplePath], {
        cwd: desktopDir,
        stdio: 'inherit',
      });

  const offenders = [];
  let browser = null;
  try {
    await waitForCdp(port, child);
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });

    let page = null;
    for (let attempt = 0; attempt < 20 && !page; attempt++) {
      page = (await browser.pages()).find((p) => p.url().startsWith('app://'));
      if (!page) await sleep(300);
    }
    if (!page) throw new Error('Could not find the app:// page over CDP');

    // A native alert()/confirm() is a visible sink too; check its text, then dismiss so it never blocks.
    page.on('dialog', async (d) => {
      const msg = d.message();
      if (HANGUL.test(stripAllowlisted(msg))) offenders.push({ state: 'native dialog', items: [msg] });
      await d.dismiss().catch(() => {});
    });

    // #ribbon is a static empty <div> already present in index.html — waiting on it alone only
    // proves the page loaded, not that the Ribbon class finished mounting. Wait for the View tab
    // button specifically: it's the last of the six tabs appended in RIBBON_TABS order, so its
    // presence proves the whole ribbon (and the style-bar it mounts) is fully built.
    await page.waitForSelector('.ribbon-tabs button[aria-controls="ribbon-panel-view"]', { timeout: 20000 });
    // Defensive: an autosave-recovery dialog can appear from an earlier force-stopped session. In
    // practice desktopStartupPlan() suppresses recovery whenever launch files are present (always true
    // here), but Escape on an already-clean state is a harmless no-op either way.
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(200);

    const record = (state, result) => {
      if (result.skipped) {
        console.log(`[skip] ${state}: ${result.reason}`);
        return;
      }
      const bad = findOffenders(result.texts);
      console.log(`[check] ${state}: ${result.texts.length} strings, ${bad.length} offender(s)`);
      if (bad.length) offenders.push({ state, items: bad });
    };
    const check = (state, texts) => record(state, { skipped: false, texts });

    // 1. Main window chrome (#ribbon, #style-bar incl. <select> options, #status-bar) on the default Home tab.
    check('initial chrome (Home tab)', await getVisibleText(page));

    // 2. Every other ribbon tab panel.
    for (const tabId of ['insert', 'layout', 'references', 'review', 'view']) {
      await selectRibbonTab(page, tabId);
      check(`ribbon tab panel: ${tabId}`, await getVisibleText(page));
    }
    await selectRibbonTab(page, 'home');

    // 3. The File page.
    await selectRibbonTab(page, 'file');
    check('File page', await getVisibleText(page));
    await page.click('.ribbon-file-back');
    await sleep(100);

    // 4-6. Body text: caret placement, right-click context menu, command palette (empty query).
    const bodyPoint = await clickBodyTextPoint(page);
    await page.mouse.click(bodyPoint.x, bodyPoint.y, { button: 'right' });
    await sleep(200);
    check('context menu: body text', await getVisibleText(page));
    await page.keyboard.press('Escape');
    await sleep(100);

    await page.keyboard.down('Control');
    await page.keyboard.press('/');
    await page.keyboard.up('Control');
    await sleep(200);
    check('command palette (empty query)', await getVisibleText(page));
    await page.keyboard.press('Escape');
    await sleep(100);

    // 7. Every ribbon/File-page dialog command that doesn't need a table (run before one exists, so
    // insert:equation's !inTable gate etc. stay enabled).
    for (const { tab, cmd } of DIALOG_COMMANDS) {
      record(`dialog: ${cmd}`, await checkDialogCommand(page, tab, cmd));
    }
    record('dialog: file:print-to-pdf (guidance)', await checkPrintToPdf(page));

    // 8-12. Insert a 2x2 table, then the table-context checks: its own picker text, the context menu
    // inside the table, and the two dialogs that require inTable.
    await selectRibbonTab(page, 'insert');
    const tcSel = '[data-ribbon-cmd="table:create"]';
    const tcDisabled = await page.$eval(tcSel, (el) => el.disabled).catch(() => true);
    if (tcDisabled) {
      console.error('[check-english-ui] table:create is disabled; skipping all table-context checks');
    } else {
      await page.$eval(tcSel, (el) =>
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })),
      );
      await sleep(200);
      check('dialog: table:create (grid picker)', await getVisibleText(page));
      const cellHandle = await page.evaluateHandle(() => {
        for (const el of Array.from(document.body.children).reverse()) {
          const cell = el.querySelector?.('[data-row="1"][data-col="1"]');
          if (cell) return cell;
        }
        return null;
      });
      const cellEl = cellHandle.asElement();
      if (!cellEl) {
        console.error('[check-english-ui] could not find the 2x2 grid cell; skipping table-context checks');
        await page.keyboard.press('Escape').catch(() => {});
      } else {
        await cellEl.click(); // real click: the grid picker's own listener, not a ribbon command
        await sleep(300);

        // createTable doesn't guarantee the caret lands in the new table; click it explicitly.
        await page.mouse.click(bodyPoint.x, bodyPoint.y);
        await sleep(150);
        await page.mouse.click(bodyPoint.x, bodyPoint.y, { button: 'right' });
        await sleep(200);
        check('context menu: inside table', await getVisibleText(page));
        await page.keyboard.press('Escape');
        await sleep(100);

        record('dialog: table:cell-props', await checkDialogCommand(page, 'layout', 'table:cell-props'));
        record('dialog: table:cell-split', await checkDialogCommand(page, 'layout', 'table:cell-split'));
      }
    }

    browser.disconnect();
    browser = null;
  } finally {
    if (browser) browser.disconnect();
    killTree(child.pid);
  }

  console.log('');
  if (offenders.length === 0) {
    console.log('[check-english-ui] PASS: no Hangul found in visible UI states.');
    process.exit(0);
  }
  console.log(`[check-english-ui] FAIL: ${offenders.length} state(s) with Hangul text:`);
  for (const { state, items } of offenders) {
    console.log(`  ${state}:`);
    for (const item of items) console.log(`    - ${JSON.stringify(item)}`);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error('[check-english-ui] error:', error);
  process.exit(1);
});
