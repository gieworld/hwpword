import type { WasmBridge } from '@/core/wasm-bridge';
import type { EventBus } from '@/core/event-bus';
import type { EquationProperties, NoteControlRef } from '@/core/types';
import type { CommandServices } from '@/command/types';
import { EquationEditorDialog } from './equation-editor-dialog';
import { enableDialogDrag } from './dialog-drag';

type TabName = 'Basic' | 'Margin/Caption' | 'Equation';

const TAB_NAMES: TabName[] = ['Basic', 'Margin/Caption', 'Equation'];

function hwpunitToMm(hu: number): number {
  return hu * 25.4 / 7200;
}

function formatMm(hu: number | undefined): string {
  return typeof hu === 'number' && Number.isFinite(hu) ? hwpunitToMm(hu).toFixed(2) : '';
}

function colorRefToHex(colorRef: number): string {
  const r = colorRef & 0xFF;
  const g = (colorRef >> 8) & 0xFF;
  const b = (colorRef >> 16) & 0xFF;
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function hexToColorRef(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return (b << 16) | (g << 8) | r;
}

export class EquationPropertiesDialog {
  private overlay!: HTMLDivElement;
  private dialog!: HTMLDivElement;
  private tabGroup!: HTMLDivElement;
  private body!: HTMLDivElement;
  private tabs: HTMLButtonElement[] = [];
  private panels: HTMLDivElement[] = [];
  private built = false;

  private sec = 0;
  private para = 0;
  private ci = 0;
  private cellIdx?: number;
  private cellParaIdx?: number;
  private noteRef?: NoteControlRef;
  private props: EquationProperties | null = null;

  private widthInput!: HTMLInputElement;
  private heightInput!: HTMLInputElement;
  private treatAsCharInput!: HTMLInputElement;
  private horzOffsetInput!: HTMLInputElement;
  private vertOffsetInput!: HTMLInputElement;
  private outerMarginLeftInput!: HTMLInputElement;
  private outerMarginRightInput!: HTMLInputElement;
  private outerMarginTopInput!: HTMLInputElement;
  private outerMarginBottomInput!: HTMLInputElement;
  private captionPositionSelect!: HTMLSelectElement;
  private captionWidthInput!: HTMLInputElement;
  private captionSpacingInput!: HTMLInputElement;
  private fontSizeInput!: HTMLInputElement;
  private colorInput!: HTMLInputElement;
  private baselineInput!: HTMLInputElement;
  private fontNameInput!: HTMLInputElement;
  private scriptArea!: HTMLTextAreaElement;

  constructor(
    private wasm: WasmBridge,
    private eventBus: EventBus,
    private services?: CommandServices,
  ) {}

  open(sec: number, para: number, ci: number, cellIdx?: number, cellParaIdx?: number, noteRef?: NoteControlRef): void {
    this.build();
    this.sec = sec;
    this.para = para;
    this.ci = ci;
    this.cellIdx = cellIdx;
    this.cellParaIdx = cellParaIdx;
    this.noteRef = noteRef;

    try {
      this.props = noteRef
        ? this.wasm.getNoteEquationProperties(noteRef)
        : this.wasm.getEquationProperties(sec, para, ci, cellIdx, cellParaIdx);
    } catch (err) {
      console.warn('[EquationProperties] 수식 속성 가져오기 실패:', err);
      return;
    }

    this.populate();
    document.body.appendChild(this.overlay);
    setTimeout(() => this.dialog.focus(), 20);
  }

  hide(): void {
    this.overlay?.remove();
  }

  private build(): void {
    if (this.built) return;
    this.built = true;

    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';

    this.dialog = document.createElement('div');
    this.dialog.className = 'dialog-wrap eq-props-dialog';
    this.dialog.tabIndex = -1;

    const titleBar = document.createElement('div');
    titleBar.className = 'dialog-title';
    titleBar.textContent = 'Equation Properties';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dialog-close';
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', () => this.hide());
    titleBar.appendChild(closeBtn);
    this.dialog.appendChild(titleBar);

    const mainRow = document.createElement('div');
    mainRow.className = 'cs-main-row';

    const leftCol = document.createElement('div');
    leftCol.className = 'cs-left-col';

    this.tabGroup = document.createElement('div');
    this.tabGroup.className = 'dialog-tabs';
    leftCol.appendChild(this.tabGroup);

    this.body = document.createElement('div');
    this.body.className = 'dialog-body';
    leftCol.appendChild(this.body);

    const rightCol = document.createElement('div');
    rightCol.className = 'cs-right-col';

    const okBtn = document.createElement('button');
    okBtn.className = 'dialog-btn dialog-btn-primary';
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', () => this.handleOk());

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'dialog-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.hide());

    const editBtn = document.createElement('button');
    editBtn.className = 'dialog-btn';
    editBtn.textContent = 'Edit…';
    editBtn.addEventListener('click', () => this.openEditor());

    rightCol.append(okBtn, cancelBtn, editBtn);
    mainRow.append(leftCol, rightCol);
    this.dialog.appendChild(mainRow);
    this.overlay.appendChild(this.dialog);

    this.rebuildTabs();

    this.overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.hide();
      }
    });

    enableDialogDrag(this.dialog, titleBar);
  }

  private rebuildTabs(): void {
    this.tabGroup.replaceChildren();
    this.body.replaceChildren();
    this.tabs = [];
    this.panels = [];

    TAB_NAMES.forEach((name, idx) => {
      const btn = document.createElement('button');
      btn.className = 'dialog-tab';
      btn.textContent = name;
      btn.addEventListener('click', () => this.switchTab(idx));
      this.tabGroup.appendChild(btn);
      this.tabs.push(btn);

      const panel = name === 'Basic'
        ? this.buildBasicPanel()
        : name === 'Margin/Caption'
          ? this.buildMarginCaptionPanel()
          : this.buildEquationPanel();
      this.body.appendChild(panel);
      this.panels.push(panel);
    });
    this.switchTab(0);
  }

  private switchTab(idx: number): void {
    this.tabs.forEach((tab, i) => tab.classList.toggle('active', i === idx));
    this.panels.forEach((panel, i) => panel.classList.toggle('active', i === idx));
  }

  private buildBasicPanel(): HTMLDivElement {
    const panel = this.panel();

    const sizeFs = this.fieldset('Size');
    this.widthInput = this.textInput('', true);
    this.heightInput = this.textInput('', true);
    sizeFs.appendChild(this.row('Width', this.select(['Fixed value'], true), this.widthInput, this.unit('mm')));
    sizeFs.appendChild(this.row('Height', this.select(['Fixed value'], true), this.heightInput, this.unit('mm'), this.checkbox('Fix size', true, true)));
    panel.appendChild(sizeFs);

    const posFs = this.fieldset('Position');
    const treatAsChar = this.checkboxWithInput('Treat as character', true, true);
    this.treatAsCharInput = treatAsChar.input;
    posFs.appendChild(this.row('', treatAsChar.label));
    posFs.appendChild(this.row('Text wrapping', this.wrapButton(), this.wrapButton(), this.wrapButton(), this.wrapButton(), this.label('Text position'), this.select(['Both'], true)));
    this.horzOffsetInput = this.textInput('0.00', true);
    this.vertOffsetInput = this.textInput('0.00', true);
    posFs.appendChild(this.row('Horizontal', this.select(['Paragraph'], true), this.unit('of'), this.select(['Left'], true), this.label('from'), this.horzOffsetInput, this.unit('mm')));
    posFs.appendChild(this.row('Vertical', this.select(['Paragraph'], true), this.unit('of'), this.select(['Top'], true), this.label('from'), this.vertOffsetInput, this.unit('mm')));
    posFs.appendChild(this.row('', this.checkbox('Restrict to page area', true, true)));
    posFs.appendChild(this.row('', this.checkbox('Allow overlap', false, true)));
    posFs.appendChild(this.row('', this.checkbox('Keep object and anchor on the same page', false, true)));
    panel.appendChild(posFs);

    const bottomGrid = document.createElement('div');
    bottomGrid.className = 'eq-props-two-col';
    const rotateFs = this.fieldset('Rotation');
    rotateFs.appendChild(this.row('Rotation angle', this.textInput('', true)));
    const skewFs = this.fieldset('Skew');
    skewFs.appendChild(this.row('Horizontal', this.textInput('', true)));
    skewFs.appendChild(this.row('Vertical', this.textInput('', true)));
    bottomGrid.append(rotateFs, skewFs);
    panel.appendChild(bottomGrid);

    const etcFs = this.fieldset('Other');
    etcFs.appendChild(this.row('Number type', this.select(['Equation'], true)));
    etcFs.appendChild(this.row('', this.checkbox('Protect object', false, true)));
    panel.appendChild(etcFs);

    return panel;
  }

  private buildMarginCaptionPanel(): HTMLDivElement {
    const panel = this.panel();

    const marginFs = this.fieldset('Outer Margin');
    this.outerMarginLeftInput = this.textInput('0.00', true);
    this.outerMarginRightInput = this.textInput('0.00', true);
    this.outerMarginTopInput = this.textInput('0.00', true);
    this.outerMarginBottomInput = this.textInput('0.00', true);
    marginFs.appendChild(this.row('Left', this.outerMarginLeftInput, this.unit('mm'), this.label('Right'), this.outerMarginRightInput, this.unit('mm')));
    marginFs.appendChild(this.row('Top', this.outerMarginTopInput, this.unit('mm'), this.label('Bottom'), this.outerMarginBottomInput, this.unit('mm')));
    panel.appendChild(marginFs);

    const captionFs = this.fieldset('Caption');
    this.captionPositionSelect = this.select(['None', 'Top', 'Bottom', 'Left', 'Right'], true);
    this.captionWidthInput = this.textInput('', true);
    this.captionSpacingInput = this.textInput('', true);
    captionFs.appendChild(this.row('Position', this.captionPositionSelect));
    captionFs.appendChild(this.row('Width', this.captionWidthInput, this.unit('mm'), this.label('Spacing'), this.captionSpacingInput, this.unit('mm')));
    panel.appendChild(captionFs);

    return panel;
  }

  private buildEquationPanel(): HTMLDivElement {
    const panel = this.panel();

    const styleFs = this.fieldset('Equation');
    this.fontNameInput = this.textInput('', false);
    styleFs.appendChild(this.row('Font', this.fontNameInput));

    this.fontSizeInput = document.createElement('input');
    this.fontSizeInput.type = 'number';
    this.fontSizeInput.className = 'dialog-input';
    this.fontSizeInput.min = '1';
    this.fontSizeInput.max = '127';
    this.fontSizeInput.step = '1';
    styleFs.appendChild(this.row('Size', this.fontSizeInput, this.unit('pt')));

    this.colorInput = document.createElement('input');
    this.colorInput.type = 'color';
    this.colorInput.className = 'eq-props-color';
    styleFs.appendChild(this.row('Color', this.colorInput));

    this.baselineInput = document.createElement('input');
    this.baselineInput.type = 'number';
    this.baselineInput.className = 'dialog-input';
    this.baselineInput.step = '1';
    styleFs.appendChild(this.row('Baseline', this.baselineInput));
    panel.appendChild(styleFs);

    const scriptFs = this.fieldset('Equation Content');
    this.scriptArea = document.createElement('textarea');
    this.scriptArea.className = 'eq-props-script';
    this.scriptArea.rows = 6;
    this.scriptArea.readOnly = true;
    scriptFs.appendChild(this.scriptArea);
    panel.appendChild(scriptFs);

    return panel;
  }

  private populate(): void {
    if (!this.props) return;
    this.widthInput.value = formatMm(this.props.width);
    this.heightInput.value = formatMm(this.props.height);
    this.treatAsCharInput.checked = this.props.treatAsChar ?? true;
    this.horzOffsetInput.value = formatMm(this.props.horzOffset ?? 0);
    this.vertOffsetInput.value = formatMm(this.props.vertOffset ?? 0);
    this.outerMarginLeftInput.value = formatMm(this.props.outerMarginLeft ?? 0);
    this.outerMarginRightInput.value = formatMm(this.props.outerMarginRight ?? 0);
    this.outerMarginTopInput.value = formatMm(this.props.outerMarginTop ?? 0);
    this.outerMarginBottomInput.value = formatMm(this.props.outerMarginBottom ?? 0);
    this.captionPositionSelect.value = this.captionPositionLabel();
    this.captionWidthInput.value = this.props.hasCaption ? formatMm(this.props.captionWidth ?? 0) : '';
    this.captionSpacingInput.value = this.props.hasCaption ? formatMm(this.props.captionSpacing ?? 0) : '';
    this.fontNameInput.value = this.props.fontName || '';
    this.fontSizeInput.value = String(Math.round(this.props.fontSize / 100));
    this.colorInput.value = colorRefToHex(this.props.color);
    this.baselineInput.value = String(this.props.baseline ?? 0);
    this.scriptArea.value = this.props.script || '';
    this.switchTab(0);
  }

  private handleOk(): void {
    if (!this.props) return;

    const fontSizeRaw = Math.max(1, Math.min(127, parseInt(this.fontSizeInput.value, 10) || 10));
    const fontSize = fontSizeRaw * 100;
    const color = hexToColorRef(this.colorInput.value);
    const baseline = parseInt(this.baselineInput.value, 10) || 0;
    const fontName = this.fontNameInput.value.trim();

    const updated: Record<string, unknown> = {};
    if (fontSize !== this.props.fontSize) updated.fontSize = fontSize;
    if (color !== this.props.color) updated.color = color;
    if (baseline !== this.props.baseline) updated.baseline = baseline;
    if (fontName && fontName !== this.props.fontName) updated.fontName = fontName;

    if (Object.keys(updated).length > 0) {
      const applyProps = () => {
        if (this.noteRef) {
          this.wasm.setNoteEquationProperties(this.noteRef, updated);
        } else {
          this.wasm.setEquationProperties(this.sec, this.para, this.ci, this.cellIdx, this.cellParaIdx, updated);
        }
      };
      try {
        // [Issue #2077] 수식 속성 변경도 undo 대상이다 — 그림 속성 다이얼로그(#1320/#2028)와 동일하게
        // 편집 라우터(executeOperation)를 통과시켜 스냅샷으로 기록한다. 기존에는 wasm
        // setter 직접 호출 + document-changed emit 만 수행되어 Ctrl+Z 로 복구되지 않았다.
        // services 미주입 환경에서만 직접 적용 fallback.
        const ih = this.services?.getInputHandler();
        if (ih) {
          ih.executeOperation({
            kind: 'snapshot',
            operationType: 'objectProps',
            operation: () => {
              applyProps();
              return ih.getCursorPosition();
            },
          });
        } else {
          applyProps();
          this.eventBus.emit('document-changed');
        }
      } catch (err) {
        console.warn('[EquationProperties] 수식 속성 설정 실패:', err);
      }
    }
    this.hide();
  }

  private openEditor(): void {
    this.hide();
    const editor = new EquationEditorDialog(this.wasm, this.eventBus, this.services);
    editor.open(this.sec, this.para, this.ci, this.cellIdx, this.cellParaIdx, this.noteRef);
  }

  private captionPositionLabel(): string {
    if (!this.props?.hasCaption) return 'None';
    switch (this.props.captionDirection) {
      case 'Top':
        return 'Top';
      case 'Bottom':
        return 'Bottom';
      case 'Left':
        return 'Left';
      case 'Right':
        return 'Right';
      default:
        return 'None';
    }
  }

  private panel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'dialog-tab-panel';
    return panel;
  }

  private fieldset(title: string): HTMLFieldSetElement {
    const fs = document.createElement('fieldset');
    fs.className = 'cs-fieldset';
    const legend = document.createElement('legend');
    legend.textContent = title;
    fs.appendChild(legend);
    return fs;
  }

  private row(labelText: string, ...children: HTMLElement[]): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'dialog-row eq-props-row';
    if (labelText) row.appendChild(this.label(labelText));
    row.append(...children);
    return row;
  }

  private label(text: string): HTMLSpanElement {
    const label = document.createElement('span');
    label.className = 'dialog-label';
    label.textContent = text;
    return label;
  }

  private unit(text: string): HTMLSpanElement {
    const unit = document.createElement('span');
    unit.className = 'dialog-unit';
    unit.textContent = text;
    return unit;
  }

  private textInput(value: string, disabled: boolean): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dialog-input';
    input.value = value;
    input.disabled = disabled;
    return input;
  }

  private select(options: string[], disabled: boolean): HTMLSelectElement {
    const select = document.createElement('select');
    select.className = 'dialog-select';
    select.disabled = disabled;
    for (const optionText of options) {
      const option = document.createElement('option');
      option.textContent = optionText;
      select.appendChild(option);
    }
    return select;
  }

  private checkbox(text: string, checked: boolean, disabled: boolean): HTMLLabelElement {
    return this.checkboxWithInput(text, checked, disabled).label;
  }

  private checkboxWithInput(text: string, checked: boolean, disabled: boolean): { label: HTMLLabelElement; input: HTMLInputElement } {
    const label = document.createElement('label');
    label.className = 'dialog-checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.disabled = disabled;
    label.append(input, document.createTextNode(text));
    return { label, input };
  }

  private wrapButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'pp-wrap-btn';
    button.type = 'button';
    button.textContent = '▤';
    button.disabled = true;
    return button;
  }

}
