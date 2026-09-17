import type { HmlOpenMetadata } from '../core/wasm-bridge.ts';
import { toEnglishMessage } from '../core/engine-messages.ts';

const MAX_WARNING_PATHS = 3;

export function buildHmlImportWarningMessage(metadata: HmlOpenMetadata): string {
  const version = metadata.hwpmlVersion ? ` ${metadata.hwpmlVersion}` : '';
  const savable = metadata.hmlSavable === true;
  const lines = [
    savable
      ? `Opened an HML${version} document. It can be saved back to HML preserving meaning, but not identical to the original bytes.`
      : `Opened an HML${version} document. It contains elements that cannot be preserved, so it cannot be saved as HML. Save as HWP or HWPX instead.`,
  ];
  if (metadata.warnings.length === 0) return lines.join('\n');

  lines.push(`There are ${metadata.warnings.length} unsupported or converted element(s).`);
  for (const warning of metadata.warnings.slice(0, MAX_WARNING_PATHS)) {
    lines.push(`${warning.xmlPath}: ${toEnglishMessage(warning.message)}`);
  }
  if (metadata.warnings.length > MAX_WARNING_PATHS) {
    lines.push(`${metadata.warnings.length - MAX_WARNING_PATHS} more`);
  }
  return lines.join('\n');
}
