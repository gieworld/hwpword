// Electron's `page-title-updated` fires for every <title> change the renderer makes, including
// the print job's transient basename-only title (see command/commands/file.ts). Only the studio's
// own document title should ever reach the OS-level window chrome.
const APP_TITLE_SUFFIX = ' - HWP Word';

/** True for the studio's own window titles ("<document> - HWP Word"); false for anything else. */
export function isAppTitle(title) {
  return typeof title === 'string' && title.length > APP_TITLE_SUFFIX.length && title.endsWith(APP_TITLE_SUFFIX);
}
