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
import { dirname, join, resolve } from 'node:path';
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
  // Character dialog font preview: needs actual Hangul glyphs to judge how a font renders Korean
  // text, same idea as any font picker's sample text (rhwp-studio/src/ui/char-shape-dialog.ts,
  // hwpword-keep-korean, x2 — Basic and Extended tabs each have their own preview element).
  'AaBbCc 가나다 123',
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
  if (argPath) return resolve(process.cwd(), argPath); // resolve(), not join(): an absolute path must stay itself
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

/** Every dialog here (ModalDialog, FindDialog, SymbolsDialog, CommandPalette, ContextMenu,
 * CompareDialog) closes on Escape or its own .dialog-close/.dialog-btn (verified by reading each
 * class) — CompareDialog has no Escape handler at all, only .dialog-close, so both steps stay.
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

/** Every dialog in this codebase (ModalDialog, FindDialog, SymbolsDialog, CompareDialog, the
 * table:create grid picker) appends a brand-new top-level element to document.body on open — so
 * polling body.childElementCount for growth is positive evidence a dialog actually opened, not an
 * assumption. Without this, a regression that silently prevents a dialog from opening would make
 * check:english pass without having checked anything for that state. */
async function waitForNewBodyChild(page, before, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await page.evaluate(() => document.body.childElementCount);
    if (count > before) return true;
    await sleep(50);
  }
  return false;
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
  // Every DIALOG_COMMANDS entry names its actual tab per ribbon-data.ts, so its button should always
  // exist there — a miss means the command id is wrong/removed (e.g. a typo or an upstream rename),
  // which is a hard failure like a dialog not opening, not a legitimate skip.
  if (!handle) return { failed: true, reason: `[data-ribbon-cmd="${cmd}"] not found on the ${tabId} tab` };
  const disabled = await page.$eval(sel, (el) => el.disabled).catch(() => true);
  if (disabled) return { skipped: true, reason: 'disabled (command not available in this context)' };
  const before = await page.evaluate(() => document.body.childElementCount);
  await page.$eval(sel, (el) =>
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })),
  );
  const opened = await waitForNewBodyChild(page, before);
  if (!opened) return { failed: true, reason: `no dialog appeared after dispatching ${cmd}` };
  const texts = await getVisibleText(page);
  await closeOverlay(page);
  return { skipped: false, texts };
}

/** Clicks the caret into the freshly inserted table. The table lands wherever the caret was, and
 * its position on screen moves with the height of our own chrome, so one fixed click point silently
 * degrades the two table dialogs into "disabled" skips the next time the ribbon changes height.
 * Probe down the column until table:cell-props actually reports enabled — that is the precondition
 * those checks need — and return the point that worked so the context menu uses it too.
 * (Ribbon.refreshStates only updates the visible panel, hence selecting the Layout tab first.) */
async function placeCaretInTable(page, point) {
  await selectRibbonTab(page, 'layout');
  for (const dy of [0, 12, 24, 36, 48, 60]) {
    const at = { x: point.x, y: point.y + dy };
    await page.mouse.click(at.x, at.y);
    await sleep(150);
    const enabled = await page
      .$eval('[data-ribbon-cmd="table:cell-props"]', (el) => !el.disabled)
      .catch(() => false);
    if (enabled) return at;
  }
  return null;
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
  const before = await page.evaluate(() => document.body.childElementCount);
  await page.$eval(sel, (el) =>
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })),
  );
  const opened = await waitForNewBodyChild(page, before);
  if (!opened) {
    await page.click('.ribbon-file-back').catch(() => {});
    return { failed: true, reason: 'no dialog appeared after dispatching file:print-to-pdf' };
  }
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

/** Click-drags a real text *selection* starting at `point` (per the known quirk in
 * gui-verification.md: double-click word selection doesn't register in this canvas editor). Needed
 * for format:char-shape, whose execute() silently no-ops without one — its `canExecute` only checks
 * `hasDocument`, so the ribbon button stays enabled and dispatching it on a bare caret does nothing.
 * A short drag (~150px) was unreliable in practice; a longer one spanning two lines registers
 * consistently. */
async function selectBodyTextRun(page, point) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 400, point.y + 60, { steps: 10 });
  await page.mouse.up();
  await sleep(200);
}

// Ribbon buttons whose command opens a DOM dialog (rhwp-studio CommandDef.opensDialog === true),
// cross-referenced against rhwp-studio/src/ui/ribbon-data.ts. table:create, table:cell-props and
// table:cell-split are driven separately below (they need an actual table to act on); file:print-to-pdf
// is driven separately above (see checkPrintToPdf).
//
// Skipped entirely — native OS pickers or the print dialog, per the task brief:
//   file:open, file:save, file:save-as, file:save-as-hwp, file:save-as-hwpx, file:print,
//   file:export-doc, file:export-html, insert:image.
// Also skipped: file:new-doc — on this (unmodified-so-far) document it opens no dialog at all, and by
// the time this script has exercised anything else the document is no longer unmodified.
//
// edit:compare-documents opens a genuine DOM dialog (CompareDialog, class "compare-dialog
// doc-compare-dialog") before any native picker is involved — the native file picker only opens if
// its "Choose File" button is clicked, which this script never does. It's checked like any other
// dialog command below; closeOverlay()'s .dialog-close fallback closes it (it has no Escape handler).
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
  { tab: 'review', cmd: 'edit:compare-documents' },
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
      if (!exePath) throw new Error('--exe needs a path to HWP Word.exe');
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
    // The ribbon existing doesn't mean the *document* has finished loading: ribbon command states
    // (e.g. format:char-shape's hasDocument gate) and the style-bar's own content stay stale/empty
    // until it has. The studio sets the window title to "<document> - HWP Word" only once it does
    // (desktop/lib/window-title.mjs) — a real readiness signal, not a guessed fixed delay.
    const titleDeadline = Date.now() + 20000;
    let sawAppTitle = false;
    while (Date.now() < titleDeadline) {
      if ((await page.title()).endsWith(' - HWP Word')) {
        sawAppTitle = true;
        break;
      }
      await sleep(200);
    }
    if (!sawAppTitle) throw new Error('Document never finished loading (window title never became "<document> - HWP Word")');
    // Defensive: an autosave-recovery dialog can appear from an earlier force-stopped session. In
    // practice desktopStartupPlan() suppresses recovery whenever launch files are present (always true
    // here), but Escape on an already-clean state is a harmless no-op either way.
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(200);

    // A `failed` result (a dialog that should have opened didn't) is a hard failure, not a soft
    // skip: it goes into the same `offenders` list that decides the exit code, so a regression that
    // silently prevents a dialog from opening makes check:english fail loudly instead of passing
    // having checked nothing for that state.
    const record = (state, result) => {
      if (result.failed) {
        console.error(`[FAIL] ${state}: ${result.reason}`);
        offenders.push({ state, items: [`(dialog did not open) ${result.reason}`] });
        return;
      }
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
    // insert:equation's !inTable gate etc. stay enabled). format:char-shape is first in the list and
    // needs a real selection (not just the caret from clickBodyTextPoint above) — see
    // selectBodyTextRun's docstring — so establish one right before this loop rather than trust it
    // survived the context-menu/command-palette interaction above.
    await selectBodyTextRun(page, bodyPoint);
    for (const { tab, cmd } of DIALOG_COMMANDS) {
      record(`dialog: ${cmd}`, await checkDialogCommand(page, tab, cmd));
    }
    record('dialog: file:print-to-pdf (guidance)', await checkPrintToPdf(page));

    // The selection from selectBodyTextRun is still active here and table:create would insert over
    // it instead of at a plain caret — collapse back to a caret first so the new table lands cleanly.
    await page.mouse.click(bodyPoint.x, bodyPoint.y);
    await sleep(150);

    // 8-12. Insert a 2x2 table, then the table-context checks: its own picker text, the context menu
    // inside the table, and the two dialogs that require inTable. If table setup fails at any step,
    // all four states below it are hard failures (via `record`), not silent skips — otherwise a
    // regression here would drop 4 states from the run without affecting the exit code.
    const TABLE_DEPENDENT_STATES = [
      'dialog: table:create (grid picker)',
      'context menu: inside table',
      'dialog: table:cell-props',
      'dialog: table:cell-split',
    ];
    const failAllTableStates = (reason) => {
      for (const state of TABLE_DEPENDENT_STATES) record(state, { failed: true, reason });
    };

    await selectRibbonTab(page, 'insert');
    const tcSel = '[data-ribbon-cmd="table:create"]';
    const tcDisabled = await page.$eval(tcSel, (el) => el.disabled).catch(() => true);
    if (tcDisabled) {
      failAllTableStates('table:create is disabled; could not set up the 2x2 table these checks need');
    } else {
      const tcBefore = await page.evaluate(() => document.body.childElementCount);
      await page.$eval(tcSel, (el) =>
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })),
      );
      const tcOpened = await waitForNewBodyChild(page, tcBefore);
      if (!tcOpened) {
        failAllTableStates('no grid picker appeared after dispatching table:create');
      } else {
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
          const reason = 'could not find the 2x2 grid cell in the picker; no table was created';
          record('context menu: inside table', { failed: true, reason });
          record('dialog: table:cell-props', { failed: true, reason });
          record('dialog: table:cell-split', { failed: true, reason });
          await page.keyboard.press('Escape').catch(() => {});
        } else {
          await cellEl.click(); // real click: the grid picker's own listener, not a ribbon command
          await sleep(300);

          // createTable doesn't guarantee the caret lands in the new table; click it explicitly.
          const tablePoint = await placeCaretInTable(page, bodyPoint);
          if (!tablePoint) {
            // The grid picker above already reported; only the states that need the caret fail here.
            const reason = 'could not get the caret inside the new table; table:cell-props stayed disabled';
            record('context menu: inside table', { failed: true, reason });
            record('dialog: table:cell-props', { failed: true, reason });
            record('dialog: table:cell-split', { failed: true, reason });
            await page.keyboard.press('Escape').catch(() => {});
          } else {
            await page.mouse.click(tablePoint.x, tablePoint.y, { button: 'right' });
            await sleep(200);
            check('context menu: inside table', await getVisibleText(page));
            await page.keyboard.press('Escape');
            await sleep(100);

            record('dialog: table:cell-props', await checkDialogCommand(page, 'layout', 'table:cell-props'));
            record('dialog: table:cell-split', await checkDialogCommand(page, 'layout', 'table:cell-split'));
          }
        }
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
