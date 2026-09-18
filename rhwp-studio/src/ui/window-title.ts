/**
 * The window title, which is also the only place that tells the user whether their edits have been
 * saved: nothing else in the chrome marks a modified document (the Save button is always enabled).
 *
 * Keep the ` - HWP Word` suffix — the desktop shell only forwards titles that end with it to the OS
 * window (see desktop/lib/window-title.mjs), so a title without it never reaches the title bar.
 */
export function documentWindowTitle(fileName: string, dirty: boolean): string {
  return `${dirty ? '• ' : ''}${fileName} - HWP Word`;
}
