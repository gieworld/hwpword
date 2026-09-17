import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from './support/source-guard.ts';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Modules the guard does not scan, with why each is safe to skip (each was checked for a
 * reachable DOM/toast/alert/status-bar sink; none has one):
 *  - src/core/generated/: font rule data (Korean font names are data)
 *  - src/core/hwp-constants.ts: HwpCtrl API constant names
 *  - src/hwpctl/: HwpCtrl compatibility API
 *  - src/document-agent/: RPC bridge for an external embedding parent, not the desktop UI;
 *    its errors serialize into a postMessage response, never a DOM/toast/alert sink.
 *  - src/automation/: external automation API; its Korean strings are thrown Errors for
 *    API misuse, or DOM text written into the permanently `display: none` #menu-bar.
 *  - src/embed/: embed runtime, unused in the desktop app
 *  - src/plugin/: plugin host, unused in the desktop build (dev-probe-plugin.ts is
 *    import.meta.env.DEV-gated and stripped from production)
 *  - src/core/rhwp-dev.ts, src/core/subsecond-runtime.ts: developer tooling (devtools console only)
 */
const NON_UI_SOURCES = [
  'src/core/generated/',
  'src/core/hwp-constants.ts',
  'src/hwpctl/',
  'src/document-agent/',
  'src/automation/',
  'src/embed/',
  'src/plugin/',
  'src/core/rhwp-dev.ts',
  'src/core/subsecond-runtime.ts',
];

/** posix-relative `src/...` paths of every `.ts` file under src, sorted. */
function allStudioSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.ts')) out.push(relative(rootDir, full).split(sep).join('/'));
    }
  };
  walk(join(rootDir, 'src'));
  return out.sort();
}

/**
 * Studio sources outside NON_UI_SOURCES that still contain Korean UI text. To regenerate:
 * run this file — the second test below names entries to remove (already clean) and the first
 * names files to add (newly dirty). Later tasks translate files and shrink this list to empty.
 */
const PENDING_TRANSLATION = [
  'src/command/contextual-shortcut.ts',
  'src/command/export-html.ts',
  'src/command/print-surface.ts',
  'src/command/save-format.ts',
  'src/command/shortcut-map.ts',
  'src/compare/diff-engine.ts',
  'src/compare/diff-location-label.ts',
  'src/core/canvaskit-document-preflight.ts',
  'src/core/chart-grid-model.ts',
  'src/core/document-signature.ts',
  'src/core/font-decision-trace.ts',
  'src/core/font-loader.ts',
  'src/core/font-substitution.ts',
  'src/core/hml-save-capability.ts',
  'src/core/local-fonts.ts',
  'src/core/local-text-replace-result.ts',
  'src/core/numbering-defaults.ts',
  'src/core/page-body-limits.ts',
  'src/core/paper-defaults.ts',
  'src/core/user-settings.ts',
  'src/core/wasm-bridge.ts',
  'src/engine/cell-selection-phase.ts',
  'src/engine/command.ts',
  'src/engine/cursor.ts',
  'src/engine/header-footer-mode.ts',
  'src/engine/input-handler-keyboard.ts',
  'src/engine/input-handler-mouse.ts',
  'src/engine/input-handler-picture.ts',
  'src/engine/input-handler-table.ts',
  'src/engine/input-handler-text.ts',
  'src/history/idb-store.ts',
  'src/recent/recent-open.ts',
  'src/recovery/recovery-format.ts',
  'src/ui/bookmark-dialog.ts',
  'src/ui/cell-border-bg-dialog.ts',
  'src/ui/cell-split-dialog.ts',
  'src/ui/chart-data-dialog.ts',
  'src/ui/chrome-mode.ts',
  'src/ui/column-settings-dialog.ts',
  'src/ui/command-palette.ts',
  'src/ui/compare-dialog.ts',
  'src/ui/compare-result-window.ts',
  'src/ui/drop-confirm-dialog.ts',
  'src/ui/endnote-shape-dialog.ts',
  'src/ui/equation-editor-dialog.ts',
  'src/ui/equation-props-dialog.ts',
  'src/ui/field-edit-dialog.ts',
  'src/ui/field-insert-dialog.ts',
  'src/ui/font-set-dialog.ts',
  'src/ui/font-set-edit-dialog.ts',
  'src/ui/formula-dialog.ts',
  'src/ui/grid-settings-dialog.ts',
  'src/ui/history-dialog.ts',
  'src/ui/hml-import-warning-message.ts',
  'src/ui/hml-save-format-dialog.ts',
  'src/ui/hml-save-format-message.ts',
  'src/ui/local-fonts-modal.ts',
  'src/ui/new-number-dialog.ts',
  'src/ui/numbering-dialog.ts',
  'src/ui/options-dialog.ts',
  'src/ui/page-border-dialog.ts',
  'src/ui/picture-props-dialog.ts',
  'src/ui/section-settings-dialog.ts',
  'src/ui/shape-picker.ts',
  'src/ui/skin-onboarding-dialog.ts',
  'src/ui/style-toolbar-overflow.ts',
  'src/ui/symbols-dialog.ts',
  'src/ui/table-row-column-dialog.ts',
  'src/ui/validation-modal.ts',
  'src/ui/zoom-dialog.ts',
  'src/view/canvas-pool.ts',
  'src/view/canvas-view.ts',
  'src/view/canvaskit-renderer.ts',
  'src/view/page-renderer.ts',
  'src/view/renderer-session.ts',
  'src/view/toolbox-visibility.ts',
  'src/view/zoom-dialog-state.ts',
];

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;

/**
 * Korean that is document data, not UI: font families that must match fonts named inside HWP files,
 * and Hancom's attribution sentence, whose exact wording the HWP spec licence requires. Longer names first.
 */
const KOREAN_DATA = [
  '본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.',
  '함초롬바탕',
  '함초롬돋움',
  '한컴바탕',
  '한컴돋움',
  '맑은 고딕',
  '나눔고딕',
  '나눔명조',
  '바탕체',
  '돋움체',
  '굴림체',
  '궁서체',
  '바탕',
  '돋움',
  '굴림',
  '궁서',
];

const KEEP_MARKER = 'hwpword-keep-korean';

function withoutKoreanData(line: string): string {
  return KOREAN_DATA.reduce((text, name) => text.split(name).join(''), line);
}

function koreanUiLines(relativePath: string): string[] {
  const raw = readFileSync(join(rootDir, relativePath), 'utf8').split('\n');
  const code = codeOnly(raw.join('\n')).split('\n');
  return code.flatMap((line, index) => {
    if (raw[index].includes(KEEP_MARKER)) return [];
    if (/\bconsole\.(log|info|warn|error|debug)\(/.test(line)) return [];
    return HANGUL.test(withoutKoreanData(line)) ? [`${relativePath}:${index + 1}: ${raw[index].trim()}`] : [];
  });
}

test('every studio UI source outside the pending list is English', () => {
  const pending = new Set(PENDING_TRANSLATION);
  const files = allStudioSources().filter(
    (file) => !NON_UI_SOURCES.some((prefix) => file.startsWith(prefix)) && !pending.has(file),
  );
  assert.deepEqual(files.flatMap(koreanUiLines), []);
});

test('the pending translation list only names files that still contain Korean UI text', () => {
  assert.deepEqual(PENDING_TRANSLATION.filter((file) => koreanUiLines(file).length === 0), []);
});

test('the visible style bar and status bar in index.html are English', () => {
  const html = readFileSync(join(rootDir, 'index.html'), 'utf8');
  const start = html.indexOf('<div id="style-bar">');
  const end = html.indexOf('</footer>');
  assert.ok(start > 0 && end > start, 'style bar / status bar markers not found in index.html');
  const offenders = html
    .slice(start, end)
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    // Attribute values (e.g. option value="함초롬바탕") are data, not visible text — strip them before
    // the Hangul check instead of exempting via withoutKoreanData, so Korean *visible* text on the same
    // line (e.g. that same option's text content) is still caught.
    .map((line) => line.replace(/\s[\w:-]+="[^"]*"/g, ''))
    .filter((line) => HANGUL.test(line))
    .map((line) => line.trim());
  assert.deepEqual(offenders, []);
});
