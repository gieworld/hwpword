import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { rename, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const DOCUMENT_EXTENSION = /\.(hwp|hwpx|hml)$/i;

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Document paths passed on the command line (Explorer double-click, "Open with", a second launch). */
export function launchPathsFromArgv(argv, cwd = process.cwd(), exists = isFile) {
  return argv
    .filter((arg) => !arg.startsWith('-') && DOCUMENT_EXTENSION.test(arg))
    .map((arg) => resolve(cwd, arg))
    .filter((path) => exists(path));
}

/**
 * Per-window allowlist of launched files. The renderer only ever sees opaque tokens, so a window
 * can read or write exactly the files it was launched with and nothing else on disk.
 */
export class LaunchFileRegistry {
  #windows = new Map();

  register(ownerId, paths) {
    this.#windows.set(ownerId, new Map(paths.map((path) => [randomUUID(), path])));
  }

  list(ownerId) {
    return [...(this.#windows.get(ownerId) ?? [])].map(([token, path]) => ({ token, name: basename(path) }));
  }

  pathFor(ownerId, token) {
    return this.#windows.get(ownerId)?.get(token) ?? null;
  }

  release(ownerId) {
    this.#windows.delete(ownerId);
  }
}

/** One key per file on disk. HWP Word is Windows-only, where paths are case-insensitive. */
export function pathKey(path) {
  return resolve(path).toLowerCase();
}

/** Wraps `write(path, bytes)` so saves to the same file run one after another; each call still reports its own result. */
export function createSerialWriter(write = writeFileAtomic) {
  const tails = new Map();
  return (path, bytes) => {
    const key = pathKey(path);
    const run = (tails.get(key) ?? Promise.resolve()).then(() => write(path, bytes));
    const tail = run.catch(() => {});
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return run;
  };
}

/** Temp file + rename, so a failed save never leaves a half-written document. */
export async function writeFileAtomic(path, bytes) {
  const temp = `${path}.hwpword-${randomUUID()}.tmp`;
  try {
    await writeFile(temp, bytes);
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
