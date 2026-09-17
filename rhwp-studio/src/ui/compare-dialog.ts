import type { CommandServices } from '@/command/types';
import { formatDiffLocationCombined } from '@/compare/diff-location-label';
import { compareDocuments } from '@/compare/diff-engine';
import { toEnglishMessage } from '@/core/engine-messages';
import type { CompareSessionStore } from '@/compare/session';
import type { CompareOptions, DiffItem, DiffKind } from '@/compare/types';
import { CompareResultWindow } from './compare-result-window';

const DEFAULT_KINDS: DiffKind[] = ['text', 'table', 'shape', 'image', 'chart'];
const DEFAULT_COMPARE_OPTS: CompareOptions = {
  caseSensitive: true,
  ignoreWhitespace: true,
  kinds: DEFAULT_KINDS,
  // 외부 문서 비교는 stable_id 공유를 가정하지 않고 정렬 기반으로 고정.
  strategy: 'alignment',
  anchorTuning: {
    // 문서 비교 전용 프리셋: 앵커 품질을 높여 오정렬 연쇄를 줄인다.
    minTextLen: 22,
    minUniqueChars: 7,
    maxWhitespaceRatio: 0.58,
    minEntropy: 2.05,
  },
  performanceTuning: {
    // UI 프리징 방지: 타임버짓 이후 greedy/fallback 비중을 높인다.
    maxComputeMs: 2200,
    hardSegmentCells: 160000,
  },
};

type CompareFile = {
  bytes: Uint8Array;
  fileName: string;
};

export class CompareDialog {
  private readonly services: CommandServices;
  private readonly compareSessionStore: CompareSessionStore;
  private _open = false;
  private running = false;

  private wrap!: HTMLDivElement;
  private leftFileNameEl!: HTMLSpanElement;
  private rightFileNameEl!: HTMLSpanElement;
  private runBtn!: HTMLButtonElement;
  private openTwoPaneBtn!: HTMLButtonElement;
  private caseSensitiveCheck!: HTMLInputElement;
  private resultMetaEl!: HTMLSpanElement;
  private resultListEl!: HTMLUListElement;

  private leftFile: CompareFile | null = null;
  private rightFile: CompareFile | null = null;
  private resultWindow: CompareResultWindow | null = null;

  constructor(services: CommandServices, compareSessionStore: CompareSessionStore) {
    this.services = services;
    this.compareSessionStore = compareSessionStore;
  }

  isOpen(): boolean {
    return this._open;
  }

  show(): void {
    if (this._open) return;
    this._open = true;
    this.build();
    document.body.appendChild(this.wrap);
  }

  hide(): void {
    this._open = false;
    this.wrap?.remove();
  }

  private build(): void {
    this.wrap = document.createElement('div');
    this.wrap.className = 'compare-dialog doc-compare-dialog';

    const title = document.createElement('div');
    title.className = 'compare-dialog-title';
    title.innerHTML = '<span>Compare Documents</span>';
    const close = document.createElement('button');
    close.className = 'dialog-close';
    close.textContent = '\u00D7';
    close.addEventListener('click', () => this.hide());
    title.appendChild(close);
    this.wrap.appendChild(title);

    const body = document.createElement('div');
    body.className = 'compare-dialog-body';

    const hint = document.createElement('p');
    hint.className = 'history-hint';
    hint.textContent =
      'Upload two documents to compute the differences. Click a result to highlight the changed part in the left/right detail window, centered on the changed area.';
    body.appendChild(hint);

    const leftRow = document.createElement('div');
    leftRow.className = 'compare-row';
    const leftLabel = document.createElement('span');
    leftLabel.className = 'compare-label';
    leftLabel.textContent = 'Left document';
    const leftBtn = document.createElement('button');
    leftBtn.className = 'dialog-btn';
    leftBtn.textContent = 'Choose File';
    this.leftFileNameEl = document.createElement('span');
    this.leftFileNameEl.className = 'compare-file';
    this.leftFileNameEl.textContent = '(none selected)';
    leftBtn.addEventListener('click', () => void this.pickFile('left'));
    leftRow.append(leftLabel, leftBtn, this.leftFileNameEl);
    body.appendChild(leftRow);

    const rightRow = document.createElement('div');
    rightRow.className = 'compare-row';
    const rightLabel = document.createElement('span');
    rightLabel.className = 'compare-label';
    rightLabel.textContent = 'Right document';
    const rightBtn = document.createElement('button');
    rightBtn.className = 'dialog-btn';
    rightBtn.textContent = 'Choose File';
    this.rightFileNameEl = document.createElement('span');
    this.rightFileNameEl.className = 'compare-file';
    this.rightFileNameEl.textContent = '(none selected)';
    rightBtn.addEventListener('click', () => void this.pickFile('right'));
    rightRow.append(rightLabel, rightBtn, this.rightFileNameEl);
    body.appendChild(rightRow);

    const optWrap = document.createElement('div');
    optWrap.className = 'compare-options';
    const optRow = document.createElement('div');
    optRow.className = 'compare-strategy-row';
    const caseLabel = document.createElement('label');
    caseLabel.className = 'compare-checkbox';
    this.caseSensitiveCheck = document.createElement('input');
    this.caseSensitiveCheck.type = 'checkbox';
    this.caseSensitiveCheck.id = 'doc-compare-case-sensitive';
    this.caseSensitiveCheck.checked = DEFAULT_COMPARE_OPTS.caseSensitive;
    const caseSpan = document.createElement('span');
    caseSpan.textContent = 'Case-sensitive';
    caseLabel.append(this.caseSensitiveCheck, caseSpan);
    optRow.appendChild(caseLabel);
    optWrap.appendChild(optRow);
    body.appendChild(optWrap);

    const actions = document.createElement('div');
    actions.className = 'compare-actions';
    this.runBtn = document.createElement('button');
    this.runBtn.className = 'dialog-btn';
    this.runBtn.textContent = 'Compare Documents';
    this.runBtn.addEventListener('click', () => void this.onRunCompare());
    this.openTwoPaneBtn = document.createElement('button');
    this.openTwoPaneBtn.className = 'dialog-btn';
    this.openTwoPaneBtn.textContent = 'Open Two-Pane View';
    this.openTwoPaneBtn.disabled = true;
    this.openTwoPaneBtn.addEventListener('click', () => this.openResultWindow());
    actions.append(this.runBtn, this.openTwoPaneBtn);
    body.appendChild(actions);

    const resultsWrap = document.createElement('div');
    resultsWrap.className = 'compare-results';

    const resultTitle = document.createElement('div');
    resultTitle.className = 'compare-kinds-title';
    resultTitle.textContent = 'Comparison Results';

    this.resultMetaEl = document.createElement('span');
    this.resultMetaEl.className = 'compare-result-meta';
    this.resultMetaEl.textContent = 'Not compared yet';
    this.resultListEl = document.createElement('ul');
    this.resultListEl.className = 'compare-result-list';

    resultsWrap.append(resultTitle, this.resultMetaEl, this.resultListEl);
    body.appendChild(resultsWrap);

    this.wrap.appendChild(body);
    this.prefillRightFromCurrentDocument();
  }

  /** 에디터에 열린 문서를 오른쪽 비교 대상으로 기본 설정한다. */
  private prefillRightFromCurrentDocument(): void {
    if (this.rightFile) return;
    const wasm = this.services.wasm;
    if (!wasm.hasLoadedDocument()) return;
    try {
      const fmt = wasm.getSourceFormat();
      const raw = fmt === 'hwpx' ? wasm.exportHwpx() : wasm.exportHwp();
      const bytes = new Uint8Array(raw);
      this.rightFile = { bytes, fileName: wasm.fileName };
      this.rightFileNameEl.textContent = wasm.fileName;
    } catch {
      /* 미로드·보내기 실패 시 무시 */
    }
  }

  private async pickFile(side: 'left' | 'right'): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.hwp,.hwpx';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.click();
    const selected = await new Promise<File | null>((resolve) => {
      input.onchange = () => resolve(input.files?.[0] ?? null);
    });
    input.remove();
    if (!selected) return;
    const name = selected.name.toLowerCase();
    if (!name.endsWith('.hwp') && !name.endsWith('.hwpx')) {
      this.resultMetaEl.textContent = 'Only HWP/HWPX files can be selected.';
      return;
    }
    const bytes = new Uint8Array(await selected.arrayBuffer());
    const picked: CompareFile = { bytes, fileName: selected.name };
    if (side === 'left') {
      this.leftFile = picked;
      this.leftFileNameEl.textContent = selected.name;
    } else {
      this.rightFile = picked;
      this.rightFileNameEl.textContent = selected.name;
    }
  }

  private async onRunCompare(): Promise<void> {
    if (this.running) return;
    if (!this.leftFile || !this.rightFile) {
      this.resultMetaEl.textContent = 'Select both the left and right documents.';
      return;
    }

    const ctx = this.services.getContext();
    if (ctx.hasDocument) {
      const detail = ctx.canUndo
        ? 'Unsaved changes may be lost.'
        : 'If the document you are currently editing differs from the right document, the editor content will be replaced with the right file.';
      const ok = window.confirm(
        `Running the comparison will load the right document into the editor.\n${detail}\nContinue?`,
      );
      if (!ok) return;
    }

    this.running = true;
    this.runBtn.disabled = true;
    this.openTwoPaneBtn.disabled = true;
    this.runBtn.textContent = 'Comparing...';
    this.resultMetaEl.textContent = 'Computing comparison...';
    this.resultListEl.replaceChildren();

    try {
      const session = await compareDocuments(
        this.leftFile.bytes,
        this.leftFile.fileName,
        this.rightFile.bytes,
        this.rightFile.fileName,
        { ...DEFAULT_COMPARE_OPTS, caseSensitive: this.caseSensitiveCheck.checked },
      );

      await this.loadRightDocumentToEditor(this.rightFile);
      this.compareSessionStore.set(session);
      this.services.eventBus.emit('compare:mode-changed', true);

      const mode =
        session.textCompareStrategyUsed === 'identity' ? 'text=id (Map)' : 'text=alignment';
      this.resultMetaEl.textContent =
        `${session.diffItems.length} ${session.diffItems.length === 1 ? 'difference' : 'differences'} · ${mode} · "${this.leftFile.fileName}" vs "${this.rightFile.fileName}"`;
      this.renderDiffList(session.diffItems);
      this.openTwoPaneBtn.disabled = session.diffItems.length === 0;
      if (session.diffItems.length > 0) {
        this.compareSessionStore.gotoDiff(0);
      }
    } catch (e) {
      const msg = toEnglishMessage(e instanceof Error ? e.message : String(e));
      this.resultMetaEl.textContent = `Comparison failed: ${msg}`;
    } finally {
      this.running = false;
      this.runBtn.disabled = false;
      this.runBtn.textContent = 'Compare Documents';
    }
  }

  private openResultWindow(): void {
    const sess = this.compareSessionStore.get();
    if (!sess || sess.diffItems.length === 0) {
      this.resultMetaEl.textContent = 'Run a document comparison first to generate results.';
      return;
    }
    const idx = Math.max(0, sess.currentDiffIndex);
    this.resultWindow ??= new CompareResultWindow();
    if (!this.leftFile || !this.rightFile) return;
    this.resultWindow.show(sess, this.compareSessionStore, idx, {
      left: this.leftFile,
      right: this.rightFile,
    });
  }

  private async loadRightDocumentToEditor(file: CompareFile): Promise<void> {
    const requestId = `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const done = new Promise<void>((resolve, reject) => {
      const off = this.services.eventBus.on('open-document-bytes:done', (payload) => {
        const p = payload as { requestId?: string; ok: boolean; error?: string };
        if (p.requestId !== requestId) return;
        off();
        if (p.ok) resolve();
        else reject(new Error(p.error || 'Failed to load the right document'));
      });
      setTimeout(() => {
        off();
        reject(new Error('Timed out loading the right document'));
      }, 90_000);
    });
    this.services.eventBus.emit('open-document-bytes', {
      bytes: new Uint8Array(file.bytes),
      fileName: file.fileName,
      fileHandle: null,
      requestId,
    });
    await done;
  }

  private renderDiffList(items: DiffItem[]): void {
    this.resultListEl.replaceChildren();
    for (const [idx, item] of items.entries()) {
      const li = document.createElement('li');
      li.className = 'compare-result-item';
      li.dataset.diffId = item.id;
      const location = formatDiffLocationCombined(item);
      const valueDiff = this.renderValueDiff(item);
      const leftPreview = this.formatPreviewText(
        item.kind === 'text' ? item.leftPreview : this.sanitizeControlPreview(item.leftPreview),
      );
      const rightPreview = this.formatPreviewText(
        item.kind === 'text' ? item.rightPreview : this.sanitizeControlPreview(item.rightPreview),
      );
      const previewLine = (item.kind === 'text' || item.severity !== 'modified')
        ? `<div class="compare-result-preview">L: ${this.escape(leftPreview)} / R: ${this.escape(rightPreview)}</div>`
        : '';
      li.innerHTML = `<strong>[${this.escape(this.kindLabel(item.kind))}] ${this.escape(item.title)}${location ? ` <span class="compare-result-location">(${this.escape(location)})</span>` : ''}</strong>${previewLine}${valueDiff}`;
      li.addEventListener('click', () => {
        this.compareSessionStore.gotoDiff(idx);
        const sess = this.compareSessionStore.get();
        if (sess) {
          this.resultWindow ??= new CompareResultWindow();
          if (this.leftFile && this.rightFile) {
            this.resultWindow.show(sess, this.compareSessionStore, idx, {
              left: this.leftFile,
              right: this.rightFile,
            });
          } else {
            this.resultWindow.show(sess, this.compareSessionStore, idx);
          }
        }
        this.resultListEl.querySelectorAll('.compare-result-item.active').forEach((el) => el.classList.remove('active'));
        li.classList.add('active');
        li.scrollIntoView({ block: 'nearest' });
      });
      this.resultListEl.appendChild(li);
    }
  }

  private formatPreviewText(text: string): string {
    const t = text.trim().replaceAll('\r\n', '\n').replaceAll('\n', ' ↵ ').replace(/\s{2,}/g, ' ');
    if (!t) return '(none)';
    if (t.length <= 140) return t;
    return `${t.slice(0, 139)}…`;
  }

  private renderValueDiff(item: DiffItem): string {
    if (item.severity !== 'modified') return '';
    if (item.kind === 'text') {
      const l = this.formatPreviewText(item.leftPreview);
      const r = this.formatPreviewText(item.rightPreview);
      if (l === r) return '';
      return `<div class="compare-result-kv compare-result-kv-text"><div class="compare-result-kv-head">Text changed</div><div class="compare-result-kv-line"><span class="k">Before</span><span class="v">${this.escape(l)}</span></div><div class="compare-result-kv-line"><span class="k">After</span><span class="v">${this.escape(r)}</span></div></div>`;
    }
    const left = this.parseKvSummary(item.leftPreview);
    const right = this.parseKvSummary(item.rightPreview);
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    if (keys.size === 0) return '';

    const labels: Record<string, string> = {
      r: 'Row',
      c: 'Column',
      tprev: 'Text',
      cprev: 'Cell text',
      txt: 'Text hash',
      props: 'Property hash',
      box: 'Size',
      sig: 'Signature',
      crop: 'Crop',
      effect: 'Effect',
      bc: 'Brightness/contrast',
      rot: 'Rotation',
      flip: 'Flip',
      wrap: 'Text wrap',
      rel: 'Anchor',
      pix: 'Visual content',
    };

    const rows: string[] = [];
    for (const k of keys) {
      if (k === 'txt' || k === 'sig' || k === 'csha') continue;
      const lv = left[k] ?? '(없음)'; // hwpword-keep-korean — matches diff-engine's persisted "no value" sentinel
      const rv = right[k] ?? '(없음)'; // hwpword-keep-korean — matches diff-engine's persisted "no value" sentinel
      if (lv === rv) continue;
      if (k === 'cprev') {
        const cellDiff = this.formatCellPreviewDiff(lv, rv, left.csha, right.csha);
        if (cellDiff) rows.push(`${labels[k] ?? k}: ${cellDiff}`);
        else rows.push(`${labels[k] ?? k}: ${this.formatFieldValue(k, lv)} → ${this.formatFieldValue(k, rv)}`);
        continue;
      }
      rows.push(`${labels[k] ?? k}: ${this.formatFieldValue(k, lv)} → ${this.formatFieldValue(k, rv)}`);
    }
    if (rows.length === 0) {
      if (item.title.toLowerCase().includes('text changed')) {
        const changedCells = this.countChangedCellsFromHash(left.csha, right.csha);
        if (changedCells > 0) {
          return `<div class="compare-result-kv">Changed values:<br/>${changedCells} changed cells (some omitted — outside the cell preview range or text too long)</div>`;
        }
      }
      if (item.title.toLowerCase().includes('properties changed')) {
        const lp = left.props ?? '(없음)'; // hwpword-keep-korean — matches diff-engine's persisted "no value" sentinel
        const rp = right.props ?? '(없음)'; // hwpword-keep-korean — matches diff-engine's persisted "no value" sentinel
        if (lp !== rp) {
          return `<div class="compare-result-kv">Changed values:<br/>Property hash: ${this.escape(lp)} → ${this.escape(rp)}</div>`;
        }
        return '<div class="compare-result-kv">Changed values:<br/>Property value changed</div>';
      }
      return '';
    }
    const body = rows.slice(0, 4).map((r) => this.escape(r)).join('<br/>');
    return `<div class="compare-result-kv">Changed values:<br/>${body}</div>`;
  }

  private parseKvSummary(summary: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of summary.matchAll(new RegExp(String.raw`([a-z]+)=("([^"]*)"|[^\s]+)`, 'g'))) {
      const raw = m[2] ?? '';
      out[m[1]] = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    }
    return out;
  }

  private sanitizeControlPreview(text: string): string {
    return text
      .replace(new RegExp(String.raw`\s(?:txt|props|sig|cprev|csha|pix)="[^"]*"`, 'g'), '')
      .replace(/\s(?:sig|txt|props)=[^\s]+/g, '')
      .replace(/(?:^|\s)(sig|txt|props|csha|pix)=[^\s]+/g, '')
      .replaceAll('(없음)', '(none)') // hwpword-keep-korean — display substitution for the persisted "no value" sentinel (added/removed items render the raw .summary, unlike the modified path's re-parsed fields)
      .trim();
  }

  private formatFieldValue(key: string, value: string): string {
    if (value === '(없음)') return '(none)'; // hwpword-keep-korean — comparison matches diff-engine's persisted "no value" sentinel
    if (key === 'box') {
      const m = value.match(/^(-?\d+)x(-?\d+)$/);
      if (m) return `${m[1]}px × ${m[2]}px`;
    }
    if (key === 'crop') {
      const nums = value.split(',');
      if (nums.length === 4) return `left ${nums[0]}, top ${nums[1]}, right ${nums[2]}, bottom ${nums[3]}`;
    }
    if (key === 'cprev') {
      const map = this.parseCellPreviewMap(value);
      if (map.size > 0) {
        return [...map.entries()]
          .slice(0, 2)
          .map(([cell, text]) => `${cell}=${text}`)
          .join(' | ');
      }
      const normalized = value.replaceAll('&amp;', '&');
      return normalized || '(none)';
    }
    if (key === 'rot') return `${value}°`;
    if (key === 'bc') {
      const [b, c] = value.split('/');
      if (b != null && c != null) return `brightness ${b}, contrast ${c}`;
    }
    if (key === 'flip') {
      if (value === '10') return 'Horizontal';
      if (value === '01') return 'Vertical';
      if (value === '11') return 'Horizontal + Vertical';
      if (value === '00') return 'None';
    }
    return value;
  }

  private parseCellPreviewMap(value: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!value || value === '(없음)') return map; // hwpword-keep-korean — matches diff-engine's persisted "no value" sentinel
    const normalized = value.replaceAll('&amp;', '&');
    const parts = normalized.includes('&') ? normalized.split('&') : normalized.split(';');
    for (const part of parts) {
      const p = part.trim();
      if (!p) continue;
      const idx = p.includes('=') ? p.indexOf('=') : p.indexOf(':');
      if (idx <= 0) continue;
      const cell = p.slice(0, idx).trim();
      const raw = p.slice(idx + 1).trim();
      let text = raw;
      try {
        text = decodeURIComponent(raw);
      } catch {
        text = raw;
      }
      if (!cell) continue;
      map.set(cell, text || '(empty)');
    }
    return map;
  }

  private parseCellHashMap(value: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!value || value === '(없음)') return map; // hwpword-keep-korean — matches diff-engine's persisted "no value" sentinel
    const normalized = value.replaceAll('&amp;', '&');
    const parts = normalized.includes('&') ? normalized.split('&') : normalized.split(';');
    for (const part of parts) {
      const p = part.trim();
      if (!p) continue;
      const idx = p.includes('=') ? p.indexOf('=') : p.indexOf(':');
      if (idx <= 0) continue;
      map.set(p.slice(0, idx).trim(), p.slice(idx + 1).trim());
    }
    return map;
  }

  private formatCellPreviewDiff(left: string, right: string, leftHashRaw?: string, rightHashRaw?: string): string {
    const lmap = this.parseCellPreviewMap(left);
    const rmap = this.parseCellPreviewMap(right);
    const lh = this.parseCellHashMap(leftHashRaw ?? '');
    const rh = this.parseCellHashMap(rightHashRaw ?? '');
    const unionKeys = [...new Set([...lmap.keys(), ...rmap.keys(), ...lh.keys(), ...rh.keys()])];
    const hashChangedKeys = unionKeys.filter((k) => (lh.get(k) ?? '') !== (rh.get(k) ?? ''));
    const keys = hashChangedKeys.length > 0 ? hashChangedKeys : unionKeys;
    const changes: string[] = [];
    for (const key of keys) {
      const lv = lmap.get(key) ?? '(none)';
      const rv = rmap.get(key) ?? '(none)';
      if (lv === rv) continue;
      const prettyKey = key.replace(/^r(\d+)c(\d+)$/i, 'row $1, col $2');
      changes.push(`${prettyKey} ${lv} → ${rv}`);
      if (changes.length >= 3) break;
    }
    if (changes.length === 0) return '';
    return changes.join(' / ');
  }

  private countChangedCellsFromHash(leftHashRaw?: string, rightHashRaw?: string): number {
    const lh = this.parseCellHashMap(leftHashRaw ?? '');
    const rh = this.parseCellHashMap(rightHashRaw ?? '');
    const keys = new Set<string>([...lh.keys(), ...rh.keys()]);
    let changed = 0;
    for (const key of keys) {
      if ((lh.get(key) ?? '') !== (rh.get(key) ?? '')) changed += 1;
    }
    return changed;
  }

  private escape(text: string): string {
    return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  private kindLabel(kind: DiffItem['kind']): string {
    if (kind === 'table') return 'Table';
    if (kind === 'shape') return 'Shape';
    if (kind === 'image') return 'Image';
    if (kind === 'chart') return 'Chart';
    if (kind === 'text') return 'Text';
    return 'Meta';
  }
}

