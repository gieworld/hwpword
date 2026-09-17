/**
 * 저장되지 않은 변경사항 확인 대화상자.
 *
 * 브라우저 창/탭 닫기는 beforeunload 기본 확인창만 사용할 수 있으므로,
 * 이 대화상자는 앱 내부 문서 교체 동작에서만 사용한다.
 */
import { ModalDialog } from './dialog';

export type UnsavedChangesChoice = 'save' | 'discard' | 'cancel';

interface UnsavedChangesDialogOptions {
  fileName: string;
  canSave: boolean;
  /** canSave=false일 때 본문·툴팁에 쓸 사유. 기본값은 문서 형식 제약 문구. */
  saveUnavailableReason?: string;
}

class UnsavedChangesDialog extends ModalDialog {
  private resolve!: (value: UnsavedChangesChoice) => void;

  constructor(private readonly options: UnsavedChangesDialogOptions) {
    super('Save Changes?', 420);
  }

  protected createBody(): HTMLElement {
    const body = document.createElement('div');
    body.style.padding = '16px 20px';
    body.style.lineHeight = '1.6';
    body.style.whiteSpace = 'pre-line';

    const fileName = this.options.fileName || 'the current document';
    const reason = this.options.saveUnavailableReason ?? 'This document cannot currently be saved directly.';
    body.textContent = this.options.canSave
      ? `"${fileName}" has unsaved changes.\nDo you want to save before continuing?`
      : `"${fileName}" has unsaved changes.\n${reason} You can discard the changes and continue.`;

    return body;
  }

  protected onConfirm(): void {
    this.resolve('save');
  }

  override hide(): void {
    this.resolve('cancel');
    super.hide();
  }

  showAsync(): Promise<UnsavedChangesChoice> {
    return new Promise((resolve) => {
      let resolved = false;
      this.resolve = (value: UnsavedChangesChoice) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };

      super.show();

      const footer = this.dialog.querySelector('.dialog-footer');
      const saveBtn = this.dialog.querySelector('.dialog-btn-primary') as HTMLButtonElement | null;
      const cancelBtn = footer?.querySelector('.dialog-btn:not(.dialog-btn-primary)') as HTMLButtonElement | null;

      if (saveBtn) {
        saveBtn.textContent = 'Save';
        saveBtn.disabled = !this.options.canSave;
        saveBtn.title = this.options.canSave
          ? ''
          : this.options.saveUnavailableReason ?? 'HWPX documents cannot currently be saved directly.';
      }
      if (cancelBtn) {
        cancelBtn.textContent = 'Cancel';
      }

      const discardBtn = document.createElement('button');
      discardBtn.type = 'button';
      discardBtn.className = 'dialog-btn';
      discardBtn.textContent = "Don't Save";
      discardBtn.addEventListener('click', () => {
        this.resolve('discard');
        super.hide();
      });
      footer?.insertBefore(discardBtn, cancelBtn ?? null);
    });
  }
}

export function showUnsavedChangesDialog(options: UnsavedChangesDialogOptions): Promise<UnsavedChangesChoice> {
  return new UnsavedChangesDialog(options).showAsync();
}
