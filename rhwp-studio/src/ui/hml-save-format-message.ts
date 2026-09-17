import {
  normalizeHmlSaveState,
  resolveHmlSaveCapability,
  type HmlSaveBlocker,
} from '../core/hml-save-capability.ts';
import { toEnglishMessage } from '../core/engine-messages.ts';

const MAX_BLOCKER_PATHS = 3;

interface HmlSaveMessageMetadata {
  hmlSavable?: unknown;
  saveBlockers: HmlSaveBlocker[];
}

export function buildHmlSaveFormatMessage(
  metadata: HmlSaveMessageMetadata | null,
  exporterAvailable: boolean,
): string {
  const capability = resolveHmlSaveCapability(metadata, exporterAvailable);
  if (capability.hmlEnabled) {
    return 'It can be saved back to HML preserving meaning, but not identical to the original bytes.\nChoose a format to save as.';
  }

  const lines = [
    `${capability.diagnostic ?? 'Saving as HML is not available.'}\nYou can save as HWP or HWPX.`,
  ];
  const blockers = normalizeHmlSaveState(metadata)?.saveBlockers ?? [];
  for (const blocker of blockers.slice(0, MAX_BLOCKER_PATHS)) {
    lines.push(`${blocker.xmlPath}: ${toEnglishMessage(blocker.message)}`);
  }
  if (blockers.length > MAX_BLOCKER_PATHS) {
    lines.push(`${blockers.length - MAX_BLOCKER_PATHS} more`);
  }
  return lines.join('\n');
}
