import { ModalDialog } from './dialog';
import type { EventBus } from '@/core/event-bus';
import type { CommandServices } from '@/command/types';
import { applyThroughRouter } from './dialog-apply';
import { DECORATIONS, FORMATS, POSITIONS, previewPageNumber } from './page-number-format';

/**
 * Page numbering — HWP's 쪽 > 쪽 번호 매기기.
 *
 * The number at the bottom of a page is not footer text: it is a `pgnp` control that carries its
 * own format, position and decoration characters. The engine has always parsed, rendered and
 * written it; this dialog is over `setPageNumberPos`, which lets it be changed.
 */

export class PageNumberDialog extends ModalDialog {
  private positionSel!: HTMLSelectElement;
  private formatSel!: HTMLSelectElement;
  private decorationSel!: HTMLSelectElement;
  private preview!: HTMLElement;

  // Plain fields, not parameter properties: node:test strips types without transforming, and
  // parameter properties are the one TypeScript feature it refuses (the suite imports this module
  // for previewPageNumber).
  private readonly wasm: any;
  private readonly eventBus: EventBus;
  private readonly sectionIndex: number;
  private readonly services?: CommandServices;

  constructor(wasm: any, eventBus: EventBus, sectionIndex: number, services?: CommandServices) {
    super('Page Numbers', 360);
    this.wasm = wasm;
    this.eventBus = eventBus;
    this.sectionIndex = sectionIndex;
    this.services = services;
  }

  protected createBody(): HTMLElement {
    const body = document.createElement('div');
    body.style.padding = '16px';
    body.style.display = 'grid';
    body.style.gap = '10px';

    const current = this.readCurrent();

    this.positionSel = select(POSITIONS.map((p) => [String(p.value), p.label]), String(current.position));
    this.formatSel = select(FORMATS.map((f) => [String(f.value), f.label]), String(current.format));
    this.decorationSel = select(DECORATIONS.map((d) => [d.id, d.label]), current.decoration);

    body.appendChild(field('Position:', this.positionSel));
    body.appendChild(field('Number format:', this.formatSel));
    body.appendChild(field('Decoration:', this.decorationSel));

    this.preview = document.createElement('div');
    this.preview.style.cssText = 'margin-top:4px;padding:10px;text-align:center;border:1px solid var(--ui-border);'
      + 'border-radius:4px;background:var(--ui-bg-light);font-size:15px;min-height:20px;';
    body.appendChild(this.preview);

    const refresh = (): void => this.refreshPreview();
    for (const el of [this.positionSel, this.formatSel, this.decorationSel]) el.addEventListener('change', refresh);
    refresh();

    return body;
  }

  /** What the section has now, so the dialog opens on the document's own settings. */
  private readCurrent(): { position: number; format: number; decoration: string } {
    const fallback = { position: 5, format: 0, decoration: 'plain' };
    try {
      const raw = this.wasm.getPageNumberPos?.(this.sectionIndex);
      if (!raw) return fallback;
      const info = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!info?.exists) return fallback;
      const prefix = info.prefixChar ?? '';
      const suffix = info.suffixChar ?? '';
      const dash = info.dashChar ?? '';
      const match = DECORATIONS.find((d) => d.prefix === prefix && d.suffix === suffix && d.dash === dash);
      return {
        position: typeof info.position === 'number' ? info.position : fallback.position,
        format: typeof info.format === 'number' ? info.format : fallback.format,
        decoration: match?.id ?? 'plain',
      };
    } catch (error) {
      console.warn('[page-number] could not read the current settings:', error);
      return fallback;
    }
  }

  private decoration(): { prefix: string; suffix: string; dash: string } {
    return DECORATIONS.find((d) => d.id === this.decorationSel.value) ?? DECORATIONS[0];
  }

  private refreshPreview(): void {
    const position = Number(this.positionSel.value);
    if (position === 0) {
      this.preview.textContent = 'No page number';
      return;
    }
    const { prefix, suffix, dash } = this.decoration();
    this.preview.textContent = previewPageNumber(1, Number(this.formatSel.value), prefix, suffix, dash);
  }

  protected onConfirm(): boolean {
    const position = Number(this.positionSel.value);
    const format = Number(this.formatSel.value);
    const { prefix, suffix, dash } = this.decoration();
    const apply = () => this.wasm.setPageNumberPos(this.sectionIndex, format, position, prefix, suffix, dash, '');
    return applyThroughRouter({
      services: this.services,
      label: 'PageNumberDialog',
      operationType: 'setPageNumberPos',
      operation: (ih) => { apply(); return ih.getCursorPosition(); },
      fallback: () => { apply(); this.eventBus.emit('document-changed'); },
    });
  }
}

function select(options: ReadonlyArray<readonly [string, string]>, value: string): HTMLSelectElement {
  const el = document.createElement('select');
  el.style.cssText = 'flex:1;padding:4px 8px;';
  for (const [optionValue, label] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    el.appendChild(option);
  }
  el.value = value;
  return el;
}

function field(labelText: string, control: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:8px;';
  const label = document.createElement('label');
  label.textContent = labelText;
  label.style.cssText = 'white-space:nowrap;min-width:110px;';
  row.appendChild(label);
  row.appendChild(control);
  return row;
}
