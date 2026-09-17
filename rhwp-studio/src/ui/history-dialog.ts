/**
 * 원본 오픈소스 대비 이력관리 UI 확장 (상세)
 *
 * [역할]
 * - 단순 비교 호출 UI가 아니라, "버전 스냅샷 저장소" 프론트 게이트 역할을 한다.
 * - 사용자 기준 액션: 저장 / 목록 조회 / 삭제 / 전체 비우기 / 선택 버전 vs 현재 비교.
 *
 * [저장 정책]
 * - 우선 저장 포맷: IR 스냅샷(JSON)
 *   -> 문단 stable_id를 보존하여 같은 문서의 시계열 비교에서 identity 모드를 유도한다.
 * - 레거시 포맷(bytes)도 읽을 수 있게 유지
 *   -> 기존 사용자 데이터 유실 방지(하위호환).
 *
 * [비교 실행 정책]
 * - IR 항목: `compareSnapshots(leftSnap, rightSnap, opts)` 사용
 * - legacy bytes 항목: `compareDocuments(...)`로 폴백
 * - 결과는 `CompareSessionStore.set(session)` 후 `gotoDiff(0)`로 즉시 탐색 가능하게 연결한다.
 *
 * [UI/탐색 연결]
 * - 이 다이얼로그는 자체 스크롤/렌더 목록만 담당하고,
 *   실제 문서 이동/하이라이트는 `compare:navigate-diff` 체인(main.ts)으로 위임한다.
 *
 * [유지보수 포인트]
 * - 결과 리스트 포맷(미리보기/위치 표기)은 사용성 이슈가 가장 잦다.
 * - 위치 표기는 `leftSectionPage/rightSectionPage` 우선, 없으면 anchor.pageIndex 폴백 순서 유지.
 */
import type { CommandServices } from '@/command/types';
import { formatDiffLocationCombined } from '@/compare/diff-location-label';
import { buildSnapshotFromWasm, compareDocuments, compareSnapshots } from '@/compare/diff-engine';
import { toEnglishMessage } from '@/core/engine-messages';
import type { CompareSessionStore } from '@/compare/session';
import type { CompareOptions, DiffItem, DiffKind } from '@/compare/types';
import { clearHistory, deleteHistorySnapshot, getHistoryPayload, listHistoryMeta, saveHistoryIrSnapshot } from '@/history/idb-store';
import type { DocHistoryEntryMeta } from '@/history/types';

const DEFAULT_KINDS: DiffKind[] = ['text', 'table', 'shape', 'image', 'chart', 'paragraphMeta'];

const HISTORY_COMPARE_OPTS: CompareOptions = {
  caseSensitive: true,
  ignoreWhitespace: true,
  kinds: DEFAULT_KINDS,
  // 이력 관리는 같은 문서 계통 비교가 목적이므로 stable_id(identity) 고정.
  strategy: 'identity',
  performanceTuning: {
    // identity는 O(N) 성격이므로 타임버짓을 넉넉히 유지(실질 영향 작음).
    maxComputeMs: 3000,
  },
};

export class HistoryDialog {
  private readonly services: CommandServices;
  private readonly compareSessionStore: CompareSessionStore;
  private _open = false;

  private wrap!: HTMLDivElement;
  private labelInput!: HTMLInputElement;
  private listEl!: HTMLUListElement;
  private resultMetaEl!: HTMLSpanElement;
  private resultListEl!: HTMLUListElement;
  private selectedId: string | null = null;
  private entries: DocHistoryEntryMeta[] = [];

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
    void this.refreshList();
  }

  hide(): void {
    this._open = false;
    this.wrap?.remove();
  }

  private build(): void {
    this.wrap = document.createElement('div');
    this.wrap.className = 'compare-dialog history-dialog';

    const title = document.createElement('div');
    title.className = 'compare-dialog-title';
    title.innerHTML = '<span>Version History</span>';
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
      'History is saved as an IR snapshot (JSON) that preserves paragraph stable_id. "Compare Selected With Current" uses identity (Map) comparison within the same editing session. Older entries that only stored HWP bytes (legacy) fall back to alignment comparison.';
    body.appendChild(hint);

    const saveRow = document.createElement('div');
    saveRow.className = 'compare-row';
    const lab = document.createElement('label');
    lab.className = 'compare-label';
    lab.textContent = 'Snapshot';
    lab.htmlFor = 'history-snap-label';
    this.labelInput = document.createElement('input');
    this.labelInput.id = 'history-snap-label';
    this.labelInput.type = 'text';
    this.labelInput.className = 'history-label-input';
    this.labelInput.placeholder = 'Note (defaults to the current time if left blank)';
    this.labelInput.value = '';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'dialog-btn';
    saveBtn.textContent = 'Save Current Document';
    saveBtn.addEventListener('click', () => void this.onSaveSnapshot());
    saveRow.append(lab, this.labelInput, saveBtn);
    body.appendChild(saveRow);

    const listTitle = document.createElement('div');
    listTitle.className = 'compare-kinds-title';
    listTitle.textContent = 'Saved History (Click to Select)';
    body.appendChild(listTitle);
    this.listEl = document.createElement('ul');
    this.listEl.className = 'history-list';
    body.appendChild(this.listEl);

    const actions = document.createElement('div');
    actions.className = 'compare-actions';
    const delBtn = document.createElement('button');
    delBtn.className = 'dialog-btn';
    delBtn.textContent = 'Delete Selected';
    delBtn.addEventListener('click', () => void this.onDeleteSelected());
    const clrBtn = document.createElement('button');
    clrBtn.className = 'dialog-btn';
    clrBtn.textContent = 'Clear All';
    clrBtn.addEventListener('click', () => void this.onClearAll());
    const cmpBtn = document.createElement('button');
    cmpBtn.className = 'dialog-btn';
    cmpBtn.textContent = 'Compare Selected With Current';
    cmpBtn.addEventListener('click', () => void this.onCompareWithCurrent());
    actions.append(delBtn, clrBtn, cmpBtn);
    body.appendChild(actions);

    const resTitle = document.createElement('div');
    resTitle.className = 'compare-kinds-title';
    resTitle.textContent = 'Comparison Results';
    body.appendChild(resTitle);
    this.resultMetaEl = document.createElement('span');
    this.resultMetaEl.className = 'compare-result-meta';
    this.resultMetaEl.textContent = 'Not compared yet';
    this.resultListEl = document.createElement('ul');
    this.resultListEl.className = 'compare-result-list';
    body.appendChild(this.resultMetaEl);
    body.appendChild(this.resultListEl);

    this.wrap.appendChild(body);
  }

  private async refreshList(): Promise<void> {
    this.entries = await listHistoryMeta();
    this.listEl.replaceChildren();
    for (const e of this.entries) {
      const li = document.createElement('li');
      li.className = 'history-entry';
      if (e.id === this.selectedId) li.classList.add('selected');
      li.dataset.id = e.id;
      const dt = new Date(e.createdAt).toLocaleString('en-US');
      const kindNote = e.storageKind === 'legacy' ? ' · legacy bytes' : '';
      li.innerHTML = `<strong>${this.escape(e.label)}</strong><div class="history-entry-meta">${this.escape(e.sourceFileName)} · ${(e.byteLength / 1024).toFixed(1)} KB${kindNote} · ${dt}</div>`;
      li.addEventListener('click', () => {
        this.selectedId = e.id;
        this.listEl.querySelectorAll('.history-entry').forEach((el) => el.classList.remove('selected'));
        li.classList.add('selected');
      });
      this.listEl.appendChild(li);
    }
    if (!this.entries.find((x) => x.id === this.selectedId)) this.selectedId = null;
  }

  private async onSaveSnapshot(): Promise<void> {
    const { wasm } = this.services;
    try {
      const label = this.labelInput.value.trim() || new Date().toLocaleString('en-US');
      const snap = buildSnapshotFromWasm(wasm, label, HISTORY_COMPARE_OPTS);
      await saveHistoryIrSnapshot(label, wasm.fileName, snap);
      this.labelInput.value = '';
      await this.refreshList();
      this.resultMetaEl.textContent = 'Snapshot saved.';
    } catch (err) {
      const msg = toEnglishMessage(err instanceof Error ? err.message : String(err));
      this.resultMetaEl.textContent = `Save failed: ${msg}`;
    }
  }

  private async onDeleteSelected(): Promise<void> {
    if (!this.selectedId) {
      this.resultMetaEl.textContent = 'Select an item from the list to delete first.';
      return;
    }
    await deleteHistorySnapshot(this.selectedId);
    this.selectedId = null;
    await this.refreshList();
    this.resultMetaEl.textContent = 'Deleted.';
    this.resultListEl.replaceChildren();
  }

  private async onClearAll(): Promise<void> {
    if (!window.confirm('Clear all saved document history?')) return;
    await clearHistory();
    this.selectedId = null;
    await this.refreshList();
    this.resultMetaEl.textContent = 'History cleared.';
    this.resultListEl.replaceChildren();
  }

  private async onCompareWithCurrent(): Promise<void> {
    const { wasm } = this.services;
    if (!this.selectedId) {
      this.resultMetaEl.textContent = 'Select a snapshot from the list to compare.';
      return;
    }
    const payload = await getHistoryPayload(this.selectedId);
    if (!payload) {
      this.resultMetaEl.textContent = 'Could not read the snapshot data.';
      return;
    }
    const meta = this.entries.find((x) => x.id === this.selectedId);
    const leftName = meta?.label ?? 'History snapshot';
    const rightName = wasm.fileName || 'Current document.hwp';
    this.resultMetaEl.textContent = 'Comparing...';
    this.resultListEl.replaceChildren();
    try {
      let session;
      if (payload.kind === 'ir') {
        const rightSnap = buildSnapshotFromWasm(wasm, rightName, HISTORY_COMPARE_OPTS);
        session = compareSnapshots(payload.snapshot, rightSnap, HISTORY_COMPARE_OPTS);
      } else {
        let cur: Uint8Array;
        try {
          cur = wasm.exportHwp();
        } catch {
          this.resultMetaEl.textContent = 'No current document. Open a document and try again.';
          return;
        }
        session = await compareDocuments(payload.bytes, leftName, cur, rightName, HISTORY_COMPARE_OPTS);
      }
      console.log('[rhwp:history] 최종 Diff 배열', session.diffItems);
      this.compareSessionStore.set(session);
      const mode =
        session.textCompareStrategyUsed === 'identity' ? 'text=id (Map)' : 'text=alignment';
      this.resultMetaEl.textContent = `${session.diffItems.length} ${session.diffItems.length === 1 ? 'difference' : 'differences'} · ${mode} · "${leftName}" vs "${rightName}"`;
      this.renderDiffList(session.diffItems);
      this.services.eventBus.emit('compare:mode-changed', true);
      if (session.diffItems.length > 0) {
        this.compareSessionStore.gotoDiff(0);
      }
    } catch (e) {
      const msg = toEnglishMessage(e instanceof Error ? e.message : String(e));
      this.resultMetaEl.textContent = `Comparison failed: ${msg}`;
    }
  }

  private renderDiffList(items: DiffItem[]): void {
    this.resultListEl.replaceChildren();
    for (const [idx, item] of items.entries()) {
      const li = document.createElement('li');
      li.className = 'compare-result-item';
      li.dataset.diffId = item.id;
      const location = formatDiffLocationCombined(item);
      const leftText = this.formatPreviewText(
        item.kind === 'text' ? item.leftPreview : this.sanitizeControlPreview(item.leftPreview),
      );
      const rightText = this.formatPreviewText(
        item.kind === 'text' ? item.rightPreview : this.sanitizeControlPreview(item.rightPreview),
      );
      const previewLine = (item.kind === 'text' || item.severity !== 'modified')
        ? `<div class="compare-result-preview">L: ${this.escape(leftText)} / R: ${this.escape(rightText)}</div>`
        : '';
      const inline =
        item.inlineTextDiff !== undefined && item.inlineTextDiff !== ''
          ? `<div class="compare-result-inline-diff">${this.escape(this.formatInlineDiffText(item.inlineTextDiff))}</div>`
          : '';
      const valueDiff = this.renderValueDiff(item);
      li.innerHTML = `<strong>[${this.escape(this.kindLabel(item.kind))}] ${this.escape(item.title)}${location ? ` <span class="compare-result-location">(${this.escape(location)})</span>` : ''}</strong>${previewLine}${valueDiff}${inline}`;
      li.addEventListener('click', () => {
        this.compareSessionStore.gotoDiff(idx);
        this.resultListEl.querySelectorAll('.compare-result-item.active').forEach((el) => el.classList.remove('active'));
        li.classList.add('active');
        li.scrollIntoView({ block: 'nearest' });
      });
      this.resultListEl.appendChild(li);
    }
  }

  private escape(text: string): string {
    return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  private formatPreviewText(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return '(none)';
    const visible = this.makeWhitespaceVisible(trimmed);
    return this.truncateText(visible, 140);
  }

  private formatInlineDiffText(text: string): string {
    const compact = text
      .replaceAll('\r\n', '\n')
      .split('\n')
      .map((line) => this.makeWhitespaceVisible(line).trimEnd())
      .filter((line, idx, arr) => !(line === '' && idx > 0 && arr[idx - 1] === ''))
      .join('\n');
    return this.truncateText(compact, 500);
  }

  private makeWhitespaceVisible(text: string): string {
    return text
      .replaceAll('\t', '⇥ ')
      .replaceAll('\r\n', '\n')
      .replaceAll('\n', ' ↵ ')
      .replace(/\s{2,}/g, ' ');
  }

  private truncateText(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen - 1)}…`;
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

  private kindLabel(kind: DiffItem['kind']): string {
    if (kind === 'table') return 'Table';
    if (kind === 'shape') return 'Shape';
    if (kind === 'image') return 'Image';
    if (kind === 'chart') return 'Chart';
    if (kind === 'text') return 'Text';
    return 'Meta';
  }
}
