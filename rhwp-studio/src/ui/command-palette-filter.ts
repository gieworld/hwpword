/**
 * In the desktop app, `view:skin-*` (alternate chrome skins) and `view:toolbox-*` (hide the
 * classic toolbars) fight the fixed Word look, so the command palette hides them there.
 * Elsewhere (embed/browser builds) they stay visible.
 */
export function isPaletteCommandHidden(id: string, desktop: boolean): boolean {
  return desktop && (id.startsWith('view:skin-') || id.startsWith('view:toolbox-'));
}
