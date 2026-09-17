/**
 * 문서 글꼴 상태 기반 로컬 글꼴 감지 안내 모달.
 *
 * Local Font Access API는 사용자 PC의 설치 글꼴 목록을 읽으므로,
 * 문서 로드 중 자동 조회하지 않고 사용자 선택 후 호출한다.
 */

import type { DocumentFontStatusItem, DocumentFontStatusReport } from '@/core/document-font-status';
import { enableDialogDrag } from './dialog-drag';
import { fontDisplayName } from './display-names';

export type LocalFontsChoice = 'detect' | 'web-substitute' | 'cancel';

export interface LocalFontsModalOptions {
  disableExternalWebFonts?: boolean;
}

const STATUS_LABEL: Record<DocumentFontStatusItem['status'], string> = {
  available: 'Available',
  'needs-local-check': 'Needs local check',
  'web-substitute': 'Using substitute font',
  missing: 'Missing',
};

export class LocalFontsModal {
  private overlay: HTMLDivElement | null = null;
  private captureHandler: ((e: KeyboardEvent) => void) | null = null;
  private resolver: ((choice: LocalFontsChoice) => void) | null = null;

  constructor(
    private readonly report: DocumentFontStatusReport,
    private readonly options: LocalFontsModalOptions = {},
  ) {}

  async showAsync(): Promise<LocalFontsChoice> {
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.build();
      document.body.appendChild(this.overlay!);
      this.bindKeyboard();

      const primaryBtn = this.overlay!.querySelector(
        '.dialog-btn-primary',
      ) as HTMLButtonElement | null;
      primaryBtn?.focus();
    });
  }

  private build(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'dialog-wrap';
    dialog.style.width = '520px';

    const title = document.createElement('div');
    title.className = 'dialog-title';
    title.textContent = 'Detect Local Fonts';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dialog-close';
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', () => this.resolve('cancel'));
    title.appendChild(closeBtn);
    dialog.appendChild(title);
    enableDialogDrag(dialog, title);

    const body = document.createElement('div');
    body.className = 'dialog-body';
    body.style.padding = '16px 20px';
    body.style.lineHeight = '1.6';

    const desc = document.createElement('p');
    desc.style.margin = '0 0 12px 0';
    desc.textContent = this.report.detectionMethod === 'font-presence-probe'
      ? "This document contains fonts that are not built into rhwp. To display it as close to the original as possible, we'll check whether the fonts this document needs are installed on this device."
      : "This document contains fonts that are not built into rhwp. Allow detection to check your local font list, and additionally verify any of this document's candidates missing from that list.";
    body.appendChild(desc);

    const privacy = document.createElement('p');
    privacy.style.margin = '0 0 12px 0';
    privacy.style.fontSize = '13px';
    privacy.style.color = 'var(--color-text-secondary)';
    privacy.textContent = this.report.detectionMethod === 'font-presence-probe'
      ? "This browser does not retrieve the full list of installed fonts — it only checks the fonts this document needs. The results are stored only in this browser's/extension's local storage and are never sent to a server. If you skip detection, the document continues to display with substitute fonts."
      : "Chrome/Edge's local font list can miss some installed faces, so only this document's unresolved candidates are additionally checked. The results are stored only in this browser's/extension's local storage and are never sent to a server. If you skip detection, the document continues to display with substitute fonts.";
    body.appendChild(privacy);

    if (this.options.disableExternalWebFonts) {
      const offlineNotice = document.createElement('div');
      offlineNotice.style.margin = '0 0 12px 0';
      offlineNotice.style.padding = '8px 10px';
      offlineNotice.style.border = '1px solid var(--color-border)';
      offlineNotice.style.borderRadius = '4px';
      offlineNotice.style.fontSize = '13px';
      offlineNotice.style.color = 'var(--color-text-secondary)';
      offlineNotice.textContent = 'External web fonts disabled: on. Substitute fonts are shown using bundled/system fonts instead of requesting external CDN fonts.';
      body.appendChild(offlineNotice);
    }

    const summary = document.createElement('ul');
    summary.style.margin = '0 0 12px 16px';
    summary.style.padding = '0';
    summary.style.fontSize = '13px';
    summary.style.color = 'var(--color-text-secondary)';
    const rows: Array<[string, number]> = [
      ['Available', this.report.summary.available],
      ['Needs local check', this.report.summary.needsLocalCheck],
      ['Using substitute font', this.report.summary.webSubstitute],
      ['Missing', this.report.summary.missing],
    ];
    for (const [label, count] of rows) {
      if (count === 0) continue;
      const li = document.createElement('li');
      li.textContent = `${label}: ${count}`;
      summary.appendChild(li);
    }
    body.appendChild(summary);

    const details = document.createElement('details');
    details.style.marginTop = '8px';
    const summaryEl = document.createElement('summary');
    summaryEl.textContent = 'View document font status';
    summaryEl.style.cursor = 'pointer';
    summaryEl.style.fontSize = '13px';
    summaryEl.style.color = 'var(--ui-link)';
    details.appendChild(summaryEl);

    const detailList = document.createElement('div');
    detailList.style.maxHeight = '180px';
    detailList.style.overflow = 'auto';
    detailList.style.marginTop = '8px';
    detailList.style.padding = '8px';
    detailList.style.background = 'var(--color-surface-raised)';
    detailList.style.borderRadius = '4px';
    detailList.style.fontSize = '12px';
    detailList.style.color = 'var(--color-text)';

    const maxShow = 50;
    for (const item of this.report.fonts.slice(0, maxShow)) {
      const line = document.createElement('div');
      const substitute = item.substituteFont ? ` → ${fontDisplayName(item.substituteFont)}` : '';
      line.textContent = `${fontDisplayName(item.fontName)}: ${STATUS_LABEL[item.status]}${substitute}`;
      detailList.appendChild(line);
    }
    if (this.report.fonts.length > maxShow) {
      const more = document.createElement('div');
      more.style.color = 'var(--color-text-hint)';
      more.style.marginTop = '4px';
      more.textContent = `... and ${this.report.fonts.length - maxShow} more`;
      detailList.appendChild(more);
    }
    details.appendChild(detailList);
    body.appendChild(details);

    dialog.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'dialog-footer';

    const detectBtn = document.createElement('button');
    detectBtn.className = 'dialog-btn dialog-btn-primary';
    detectBtn.textContent = 'Detect Local Fonts (Recommended)';
    detectBtn.addEventListener('click', () => this.resolve('detect'));

    const webBtn = document.createElement('button');
    webBtn.className = 'dialog-btn';
    webBtn.textContent = 'View with Substitute Fonts';
    webBtn.addEventListener('click', () => this.resolve('web-substitute'));

    footer.appendChild(detectBtn);
    footer.appendChild(webBtn);
    dialog.appendChild(footer);

    this.overlay.appendChild(dialog);
  }

  private bindKeyboard(): void {
    this.captureHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        this.resolve('cancel');
        return;
      }
      if (e.key === 'Enter') {
        e.stopPropagation();
        e.preventDefault();
        this.resolve('detect');
        return;
      }
      e.stopPropagation();
    };
    document.addEventListener('keydown', this.captureHandler, true);
  }

  private resolve(choice: LocalFontsChoice): void {
    if (this.captureHandler) {
      document.removeEventListener('keydown', this.captureHandler, true);
      this.captureHandler = null;
    }
    this.overlay?.remove();
    this.overlay = null;
    if (this.resolver) {
      this.resolver(choice);
      this.resolver = null;
    }
  }
}

export async function showLocalFontsModalIfNeeded(
  report: DocumentFontStatusReport,
  options: LocalFontsModalOptions = {},
): Promise<LocalFontsChoice> {
  if (!report.shouldPromptLocalAccess) return 'web-substitute';
  return new LocalFontsModal(report, options).showAsync();
}
