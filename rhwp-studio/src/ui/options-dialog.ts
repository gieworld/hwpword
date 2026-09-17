/**
 * 환경 설정 대화상자 (도구 > 환경 설정)
 *
 * 탭 구조: [글꼴] (향후 [편집], [보기] 등 탭 추가 가능)
 */
import { ModalDialog } from './dialog';
import { userSettings } from '@/core/user-settings';
import { FontSetDialog } from './font-set-dialog';
import {
  clearStoredLocalFonts,
  detectLocalFonts,
  getLocalFontState,
  isLocalFontAccessSupported,
  loadStoredLocalFonts,
  type LocalFontState,
} from '@/core/local-fonts';
import type { EventBus } from '@/core/event-bus';

export class OptionsDialog extends ModalDialog {
  private showRecentCheck!: HTMLInputElement;
  private recentCountInput!: HTMLInputElement;
  private recoveryEnabledCheck!: HTMLInputElement;
  private recoveryIntervalInput!: HTMLInputElement;
  private idleSaveEnabledCheck!: HTMLInputElement;
  private idleDelayInput!: HTMLInputElement;
  private pdfPrintGuidanceCheck!: HTMLInputElement;

  constructor(private readonly eventBus?: EventBus) {
    super('Options', 480);
  }

  protected createBody(): HTMLElement {
    const body = document.createElement('div');
    body.className = 'opt-body';

    // 탭 헤더
    const tabs = document.createElement('div');
    tabs.className = 'dialog-tabs';

    const fontTab = document.createElement('button');
    fontTab.className = 'dialog-tab active';
    fontTab.textContent = 'Font';
    fontTab.dataset.tab = 'font';
    tabs.appendChild(fontTab);

    const fileTab = document.createElement('button');
    fileTab.className = 'dialog-tab';
    fileTab.textContent = 'File';
    fileTab.dataset.tab = 'file';
    tabs.appendChild(fileTab);

    body.appendChild(tabs);

    // 글꼴 탭 패널
    const fontPanel = this.createFontPanel();
    fontPanel.className = 'dialog-tab-panel opt-tab-panel active';
    fontPanel.dataset.tab = 'font';
    body.appendChild(fontPanel);

    const filePanel = this.createFilePanel();
    filePanel.className = 'dialog-tab-panel opt-tab-panel';
    filePanel.dataset.tab = 'file';
    body.appendChild(filePanel);

    // 탭 클릭 이벤트 (향후 탭 추가 대비)
    tabs.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.dialog-tab') as HTMLElement | null;
      if (!btn) return;
      const tabId = btn.dataset.tab;
      tabs.querySelectorAll('.dialog-tab').forEach(t => t.classList.remove('active'));
      body.querySelectorAll('.dialog-tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = body.querySelector(`.dialog-tab-panel[data-tab="${tabId}"]`);
      panel?.classList.add('active');
    });

    return body;
  }

  private createFontPanel(): HTMLElement {
    const panel = document.createElement('div');
    const fs = userSettings.getFontSettings();

    // ── 글꼴 보기 섹션 ──
    const viewSection = document.createElement('div');
    viewSection.className = 'dialog-section';

    const viewTitle = document.createElement('div');
    viewTitle.className = 'dialog-section-title';
    viewTitle.textContent = 'Font View';
    viewSection.appendChild(viewTitle);

    // 최근 사용 글꼴 보이기
    const recentRow = document.createElement('div');
    recentRow.className = 'dialog-row opt-row';

    this.showRecentCheck = document.createElement('input');
    this.showRecentCheck.type = 'checkbox';
    this.showRecentCheck.id = 'opt-show-recent';
    this.showRecentCheck.checked = fs.showRecentFonts;

    const recentLabel = document.createElement('label');
    recentLabel.htmlFor = 'opt-show-recent';
    recentLabel.textContent = 'Show recently used fonts';

    this.recentCountInput = document.createElement('input');
    this.recentCountInput.type = 'number';
    this.recentCountInput.className = 'dialog-input opt-count-input';
    this.recentCountInput.min = '1';
    this.recentCountInput.max = '5';
    this.recentCountInput.value = String(fs.recentFontCount);

    const countLabel = document.createElement('span');
    countLabel.className = 'opt-count-label';
    countLabel.textContent = '';

    recentRow.appendChild(this.showRecentCheck);
    recentRow.appendChild(recentLabel);
    recentRow.appendChild(this.recentCountInput);
    recentRow.appendChild(countLabel);
    viewSection.appendChild(recentRow);

    panel.appendChild(viewSection);

    // ── 대표 글꼴 등록 섹션 ──
    const fontSetSection = document.createElement('div');
    fontSetSection.className = 'dialog-section';

    const fontSetTitle = document.createElement('div');
    fontSetTitle.className = 'dialog-section-title';
    fontSetTitle.textContent = 'Representative Fonts';
    fontSetSection.appendChild(fontSetTitle);

    const fontSetDesc = document.createElement('p');
    fontSetDesc.className = 'opt-desc';
    fontSetDesc.textContent = 'A representative font is a set that pairs a font for each language and applies them all at once.';
    fontSetSection.appendChild(fontSetDesc);

    const fontSetBtn = document.createElement('button');
    fontSetBtn.className = 'dialog-btn opt-fontset-btn';
    fontSetBtn.textContent = 'Register Representative Fonts…';
    fontSetBtn.addEventListener('click', () => {
      const dlg = new FontSetDialog();
      dlg.show();
    });
    fontSetSection.appendChild(fontSetBtn);

    panel.appendChild(fontSetSection);

    // ── 로컬 글꼴 섹션 ──
    const localSection = document.createElement('div');
    localSection.className = 'dialog-section';

    const localTitle = document.createElement('div');
    localTitle.className = 'dialog-section-title';
    localTitle.textContent = 'Local Fonts';
    localSection.appendChild(localTitle);

    const localDesc = document.createElement('p');
    localDesc.className = 'opt-desc';
    localDesc.textContent = 'Detects fonts installed on your PC and adds them to the font list. (Chrome/Edge enumerate the full list and then check for candidates missing from the document; Firefox only checks the candidates the document needs.)';
    localSection.appendChild(localDesc);

    const localRow = document.createElement('div');
    localRow.className = 'dialog-row opt-row opt-local-actions';

    const localBtn = document.createElement('button');
    localBtn.className = 'dialog-btn opt-fontset-btn';
    localBtn.textContent = 'Detect Local Fonts';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'dialog-btn opt-fontset-btn';
    resetBtn.textContent = 'Reset Detection Results';

    const localStatus = document.createElement('p');
    localStatus.className = 'opt-local-status';

    const updateLocalStatus = (message?: string): void => {
      const state = getLocalFontState();
      localStatus.textContent = message ?? formatLocalFontStatus(state);
      resetBtn.disabled = !state.stored;
      localBtn.textContent = state.stored ? 'Redetect Local Fonts' : 'Detect Local Fonts';
    };

    updateLocalStatus('Checking detection results…');
    void loadStoredLocalFonts().then(
      () => updateLocalStatus(),
      () => updateLocalStatus('Could not check the saved detection results.'),
    );

    localBtn.addEventListener('click', async () => {
      if (!isLocalFontAccessSupported()) {
        localStatus.textContent = getLocalFontState().method === 'font-presence-probe'
          ? 'This browser does not support detecting the full local font list. Only the fonts a document needs are checked when it is opened.'
          : 'This browser does not support local font detection.';
        return;
      }
      localBtn.disabled = true;
      resetBtn.disabled = true;
      localStatus.textContent = 'Detecting…';
      try {
        const fonts = await detectLocalFonts({ force: true });
        updateLocalStatus(`Saved the enumeration results for ${fonts.length} local fonts. Missing per-document candidates are checked when a document is opened.`);
        this.eventBus?.emit('local-fonts-changed', { fonts, source: 'options-dialog' });
      } catch (error) {
        updateLocalStatus(describeLocalFontDetectionError(error));
      }
      localBtn.disabled = false;
    });

    resetBtn.addEventListener('click', async () => {
      localBtn.disabled = true;
      resetBtn.disabled = true;
      localStatus.textContent = 'Resetting detection results…';
      try {
        await clearStoredLocalFonts();
        updateLocalStatus('Deleted the saved local font detection results.');
        this.eventBus?.emit('local-fonts-changed', { fonts: [], source: 'options-dialog-clear' });
      } catch {
        updateLocalStatus('Could not delete the saved detection results.');
      }
      localBtn.disabled = false;
    });

    localRow.appendChild(localBtn);
    localRow.appendChild(resetBtn);
    localSection.appendChild(localRow);
    localSection.appendChild(localStatus);

    panel.appendChild(localSection);

    return panel;
  }

  private createFilePanel(): HTMLElement {
    const panel = document.createElement('div');
    const autosave = userSettings.getAutosaveSettings();
    const dialogSettings = userSettings.getDialogSettings();

    const saveSection = document.createElement('div');
    saveSection.className = 'dialog-section';

    const saveTitle = document.createElement('div');
    saveTitle.className = 'dialog-section-title';
    saveTitle.textContent = 'Auto-Save Recovery File';
    saveSection.appendChild(saveTitle);

    const desc = document.createElement('p');
    desc.className = 'opt-desc';
    desc.textContent = 'For large documents, autosave creates a full HWP recovery copy, so a longer interval can reduce pauses while editing.';
    saveSection.appendChild(desc);

    this.recoveryEnabledCheck = document.createElement('input');
    this.recoveryEnabledCheck.type = 'checkbox';
    this.recoveryEnabledCheck.id = 'opt-recovery-enabled';
    this.recoveryEnabledCheck.checked = autosave.recoveryEnabled;

    this.recoveryIntervalInput = document.createElement('input');
    this.recoveryIntervalInput.type = 'number';
    this.recoveryIntervalInput.className = 'dialog-input opt-interval-input';
    this.recoveryIntervalInput.min = '1';
    this.recoveryIntervalInput.max = '120';
    this.recoveryIntervalInput.value = String(autosave.recoveryIntervalMinutes);

    saveSection.appendChild(createAutosaveNumberRow({
      checkbox: this.recoveryEnabledCheck,
      labelText: 'Auto-save for recovery',
      numberInput: this.recoveryIntervalInput,
      unitText: 'min',
    }));

    this.idleSaveEnabledCheck = document.createElement('input');
    this.idleSaveEnabledCheck.type = 'checkbox';
    this.idleSaveEnabledCheck.id = 'opt-idle-save-enabled';
    this.idleSaveEnabledCheck.checked = autosave.idleSaveEnabled;

    this.idleDelayInput = document.createElement('input');
    this.idleDelayInput.type = 'number';
    this.idleDelayInput.className = 'dialog-input opt-interval-input';
    this.idleDelayInput.min = '5';
    this.idleDelayInput.max = '600';
    this.idleDelayInput.value = String(autosave.idleDelaySeconds);

    saveSection.appendChild(createAutosaveNumberRow({
      checkbox: this.idleSaveEnabledCheck,
      labelText: 'Auto-save when idle',
      numberInput: this.idleDelayInput,
      unitText: 'sec',
    }));

    const syncDisabled = (): void => {
      this.recoveryIntervalInput.disabled = !this.recoveryEnabledCheck.checked;
      this.idleDelayInput.disabled = !this.idleSaveEnabledCheck.checked;
    };
    this.recoveryEnabledCheck.addEventListener('change', syncDisabled);
    this.idleSaveEnabledCheck.addEventListener('change', syncDisabled);
    syncDisabled();

    panel.appendChild(saveSection);

    const pdfSection = document.createElement('div');
    pdfSection.className = 'dialog-section';

    const pdfTitle = document.createElement('div');
    pdfTitle.className = 'dialog-section-title';
    pdfTitle.textContent = 'Save as PDF';
    pdfSection.appendChild(pdfTitle);

    const pdfDesc = document.createElement('p');
    pdfDesc.className = 'opt-desc';
    pdfDesc.textContent =
      'If you turn off the guidance, document preparation starts as soon as you choose to save as PDF. Preparation progress and errors are still shown.';
    pdfSection.appendChild(pdfDesc);

    const pdfRow = document.createElement('div');
    pdfRow.className = 'dialog-row opt-row';

    this.pdfPrintGuidanceCheck = document.createElement('input');
    this.pdfPrintGuidanceCheck.type = 'checkbox';
    this.pdfPrintGuidanceCheck.id = 'opt-pdf-print-guidance';
    this.pdfPrintGuidanceCheck.checked = dialogSettings.showPdfPrintGuidance;

    const pdfLabel = document.createElement('label');
    pdfLabel.htmlFor = 'opt-pdf-print-guidance';
    pdfLabel.textContent = 'Show save method guidance when saving as PDF';

    pdfRow.append(this.pdfPrintGuidanceCheck, pdfLabel);
    pdfSection.appendChild(pdfRow);
    panel.appendChild(pdfSection);

    return panel;
  }

  protected onConfirm(): void {
    const count = Math.min(5, Math.max(1, parseInt(this.recentCountInput.value) || 3));
    userSettings.updateFontSettings({
      showRecentFonts: this.showRecentCheck.checked,
      recentFontCount: count,
    });
    userSettings.updateAutosaveSettings({
      recoveryEnabled: this.recoveryEnabledCheck.checked,
      recoveryIntervalMinutes: clampInteger(this.recoveryIntervalInput.value, 10, 1, 120),
      idleSaveEnabled: this.idleSaveEnabledCheck.checked,
      idleDelaySeconds: clampInteger(this.idleDelayInput.value, 10, 5, 600),
    });
    userSettings.setShowPdfPrintGuidance(this.pdfPrintGuidanceCheck.checked);
    this.eventBus?.emit('autosave-settings-changed', { source: 'options-dialog' });
  }
}

function createAutosaveNumberRow(options: {
  checkbox: HTMLInputElement;
  labelText: string;
  numberInput: HTMLInputElement;
  unitText: string;
}): HTMLElement {
  const row = document.createElement('div');
  row.className = 'dialog-row opt-row opt-autosave-row';

  const label = document.createElement('label');
  label.htmlFor = options.checkbox.id;
  label.textContent = options.labelText;

  const unit = document.createElement('span');
  unit.className = 'opt-count-label';
  unit.textContent = options.unitText;

  row.appendChild(options.checkbox);
  row.appendChild(label);
  row.appendChild(options.numberInput);
  row.appendChild(unit);
  return row;
}

function clampInteger(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function formatLocalFontStatus(state: LocalFontState): string {
  if (state.lastError) {
    return `Storage access failed: ${state.lastError}`;
  }
  if (!state.stored) {
    if (state.method === 'font-presence-probe') {
      return 'No saved detection results. On Firefox, only the fonts a document needs are checked when it is opened.';
    }
    if (!state.supported) {
      return 'This browser does not support local font detection.';
    }
    return 'No saved detection results.';
  }

  const detectedAt = formatDetectedAt(state.detectedAt);
  const dateSuffix = detectedAt ? ` · ${detectedAt}` : '';
  if (state.source === 'font-presence-probe') {
    return `Per-document check results saved: ${state.count} available / ${state.checkedFamilies.length} fonts checked${dateSuffix}`;
  }
  if (state.checkedFamilies.length > 0) {
    return `Local font results saved: ${state.count} available / ${state.checkedFamilies.length} document candidates / ${state.probedFamilies.length} missing-enumeration checks${dateSuffix}`;
  }
  return `Local font enumeration results saved: ${state.count} · missing per-document candidates are checked when a document is opened${dateSuffix}`;
}

function formatDetectedAt(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function describeLocalFontDetectionError(error: unknown): string {
  const name = typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name?: unknown }).name ?? '')
    : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = `${name} ${message}`.toLowerCase();
  if (name === 'NotAllowedError' || normalized.includes('permission') || normalized.includes('denied')) {
    return 'Local font access was not allowed. Allow it in your browser’s permission settings and try again.';
  }
  return 'Font detection failed. You can continue using web fallback fonts.';
}
