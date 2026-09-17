import type { AutosaveDraft } from './autosave-store.ts';

function baseNameWithoutKnownExtension(fileName: string): string {
  const trimmed = fileName.trim() || 'Document.hwp';
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0) return trimmed;

  const ext = trimmed.slice(dot).toLowerCase();
  if (ext === '.hwp' || ext === '.hwpx' || ext === '.hml') {
    return trimmed.slice(0, dot);
  }
  return trimmed;
}

export function recoveryFileName(fileName: string): string {
  const base = baseNameWithoutKnownExtension(fileName);
  // An autosave draft is always an exportHwp() result, so every source format recovers as HWP.
  return `${base} Recovered.hwp`;
}

export function formatDraftSavedAt(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Unknown save time';
  return new Date(timestamp).toLocaleString('en-US');
}

export function formatDraftSize(byteLength: number): string {
  if (!Number.isFinite(byteLength) || byteLength < 0) return 'Unknown size';
  if (byteLength < 1024) return `${byteLength} B`;
  const kb = byteLength / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function describeDraft(draft: AutosaveDraft): string {
  const format = draft.sourceFormat.toUpperCase();
  const suffix = ['hwpx', 'hml'].includes(draft.sourceFormat.toLowerCase()) ? ' → recovered as HWP' : '';
  return `${formatDraftSavedAt(draft.savedAt)} · ${formatDraftSize(draft.byteLength)} · ${format}${suffix}`;
}
