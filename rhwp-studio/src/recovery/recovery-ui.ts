import { ModalDialog } from '@/ui/dialog';
import type { AutosaveDraft } from './autosave-store.ts';
import { describeDraft } from './recovery-format.ts';

export type AutosaveRecoveryChoice =
  | { action: 'restore'; draftId: string }
  | { action: 'delete-all' }
  | { action: 'later' };

class AutosaveRecoveryDialog extends ModalDialog {
  private resolve!: (choice: AutosaveRecoveryChoice) => void;
  private selectedDraftId: string;

  constructor(private readonly drafts: AutosaveDraft[]) {
    super('Document Recovery', 520);
    this.selectedDraftId = drafts[0]?.id ?? '';
  }

  protected createBody(): HTMLElement {
    const body = document.createElement('div');
    body.classList.add('recovery-dialog-body');
    body.style.padding = '16px 20px';
    body.style.lineHeight = '1.55';

    const lead = document.createElement('p');
    lead.style.margin = '0 0 12px';
    lead.textContent = 'There are unsaved document recovery drafts. Choose a document to recover.';
    body.appendChild(lead);

    const note = document.createElement('p');
    note.style.margin = '0 0 14px';
    note.style.color = 'var(--text-muted, #8b95a1)';
    note.textContent = 'Recovering will not automatically overwrite the original file. Save manually after recovering if you want to keep it.';
    body.appendChild(note);

    const list = document.createElement('div');
    list.classList.add('recovery-draft-list');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '8px';

    for (const draft of this.drafts) {
      const label = document.createElement('label');
      label.style.display = 'grid';
      label.style.gridTemplateColumns = 'auto minmax(0, 1fr)';
      label.style.columnGap = '10px';
      label.style.alignItems = 'start';
      label.style.padding = '10px';
      label.style.border = '1px solid var(--dialog-border, #4b5563)';
      label.style.cursor = 'pointer';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'autosave-recovery-draft';
      radio.value = draft.id;
      radio.checked = draft.id === this.selectedDraftId;
      radio.addEventListener('change', () => {
        this.selectedDraftId = draft.id;
      });

      const text = document.createElement('div');
      text.classList.add('recovery-draft-copy');
      const title = document.createElement('div');
      title.classList.add('recovery-draft-title');
      const displayName = draft.fileName || (() => {
        switch (draft.sourceFormat?.toLowerCase()) {
          case 'hml': return 'Document.hml';
          case 'hwpx': return 'Document.hwpx';
          default: return 'Document.hwp';
        }
      })();
      title.textContent = displayName;
      title.style.fontWeight = '600';
      const meta = document.createElement('div');
      meta.textContent = describeDraft(draft);
      meta.style.fontSize = '12px';
      meta.style.color = 'var(--text-muted, #8b95a1)';
      text.append(title, meta);

      label.append(radio, text);
      list.appendChild(label);
    }

    body.appendChild(list);
    return body;
  }

  protected onConfirm(): boolean {
    this.resolve({ action: 'restore', draftId: this.selectedDraftId });
    return true;
  }

  override hide(): void {
    this.resolve({ action: 'later' });
    super.hide();
  }

  showAsync(): Promise<AutosaveRecoveryChoice> {
    return new Promise((resolve) => {
      let resolved = false;
      this.resolve = (choice: AutosaveRecoveryChoice) => {
        if (resolved) return;
        resolved = true;
        resolve(choice);
      };

      super.show();
      this.dialog.classList.add('recovery-dialog');

      const footer = this.dialog.querySelector('.dialog-footer');
      const restoreBtn = this.dialog.querySelector('.dialog-btn-primary') as HTMLButtonElement | null;
      const cancelBtn = footer?.querySelector('.dialog-btn:not(.dialog-btn-primary)') as HTMLButtonElement | null;

      if (restoreBtn) restoreBtn.textContent = 'Restore';
      if (cancelBtn) cancelBtn.textContent = 'Later';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'dialog-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.title = 'Deletes all recovery drafts.';
      deleteBtn.addEventListener('click', () => {
        this.resolve({ action: 'delete-all' });
        super.hide();
      });
      footer?.insertBefore(deleteBtn, cancelBtn ?? null);
    });
  }
}

export function showAutosaveRecoveryDialog(drafts: AutosaveDraft[]): Promise<AutosaveRecoveryChoice> {
  return new AutosaveRecoveryDialog(drafts).showAsync();
}
