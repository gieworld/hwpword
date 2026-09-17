export interface HmlSavabilityMetadata {
  hmlSavable?: unknown;
  saveBlockers?: unknown;
}

export interface HmlSaveBlocker {
  code: string;
  xmlPath: string;
  message: string;
  preserved: false;
}

export interface HmlSaveCapability {
  hmlEnabled: boolean;
  diagnostic: string | null;
}

export interface NormalizedHmlSaveState {
  hmlSavable: boolean;
  saveBlockers: HmlSaveBlocker[];
}

export interface HmlSaveState {
  sourceFormat: string;
  hmlSavable: boolean;
  blockers: HmlSaveBlocker[];
}

export interface HmlSaveContext<T extends HmlSavabilityMetadata> {
  metadata: T | null;
  exporterAvailable: boolean;
}

function isHmlSaveBlocker(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const blocker = value as Partial<HmlSaveBlocker>;
  return typeof blocker.code === 'string'
    && typeof blocker.xmlPath === 'string'
    && typeof blocker.message === 'string'
    && (blocker.preserved === undefined || blocker.preserved === false);
}

function isCanonicalHmlSaveBlocker(value: unknown): value is HmlSaveBlocker {
  return isHmlSaveBlocker(value)
    && (value as Partial<HmlSaveBlocker>).preserved === false;
}

export function parseHmlSaveState(value: unknown): HmlSaveState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<HmlSaveState>;
  if (typeof candidate.sourceFormat !== 'string'
    || typeof candidate.hmlSavable !== 'boolean'
    || !Array.isArray(candidate.blockers)
    || !candidate.blockers.every(isCanonicalHmlSaveBlocker)) return null;
  return {
    sourceFormat: candidate.sourceFormat,
    hmlSavable: candidate.hmlSavable,
    blockers: candidate.blockers,
  };
}

export function normalizeHmlSaveState(metadata: unknown): NormalizedHmlSaveState | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const candidate = metadata as { hmlSavable?: unknown; saveBlockers?: unknown };
  const blockersAreValid = Array.isArray(candidate.saveBlockers)
    && candidate.saveBlockers.every(isHmlSaveBlocker);
  const saveBlockers: HmlSaveBlocker[] = blockersAreValid
    ? (candidate.saveBlockers as HmlSaveBlocker[]).map((blocker) => ({
        code: blocker.code,
        xmlPath: blocker.xmlPath,
        message: blocker.message,
        preserved: false,
      }))
    : [];
  return {
    hmlSavable: candidate.hmlSavable === true && blockersAreValid && saveBlockers.length === 0,
    saveBlockers,
  };
}

export function readHmlSaveContext<T extends HmlSavabilityMetadata>(
  readMetadata: () => T | null,
  readExporterAvailable: () => boolean,
): HmlSaveContext<T> {
  let metadata: T | null = null;
  let exporterAvailable = false;
  try {
    metadata = readMetadata();
  } catch {
    // Missing or stale WASM metadata must disable HML without blocking conversion saves.
  }
  try {
    exporterAvailable = readExporterAvailable() === true;
  } catch {
    // Missing or stale WASM export bindings fail closed.
  }
  return { metadata, exporterAvailable };
}

export function resolveHmlSaveCapability(
  metadata: HmlSavabilityMetadata | null,
  exporterAvailable: boolean,
): HmlSaveCapability {
  const saveState = normalizeHmlSaveState(metadata);
  if (!saveState) {
    return { hmlEnabled: false, diagnostic: 'Could not determine HML save information.' };
  }
  if (!saveState.hmlSavable) {
    return { hmlEnabled: false, diagnostic: 'Saving as HML is blocked because it contains elements that cannot be preserved.' };
  }
  if (!exporterAvailable) {
    return { hmlEnabled: false, diagnostic: 'This WASM build does not support saving as HML.' };
  }
  return { hmlEnabled: true, diagnostic: null };
}
