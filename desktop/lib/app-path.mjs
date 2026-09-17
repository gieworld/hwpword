import { isAbsolute, join, relative, sep } from 'node:path';

/** Maps `app://<host>/<path>` to a file under `rootDir`; null if the host differs or the path escapes the root. */
export function resolveAppPath(rootDir, requestUrl, host) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.host !== host) return null;

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname === '' || pathname === '/') pathname = '/index.html';

  const filePath = join(rootDir, pathname);
  const rel = relative(rootDir, filePath);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return filePath;
}

/** `scheme://host[:port]` of a URL, or null if unparseable. WHATWG `URL#origin` is "null" for custom schemes such as app:, so it is built by hand. */
export function originOf(url) {
  try {
    const { protocol, host } = new URL(url);
    return `${protocol}//${host}`;
  } catch {
    return null;
  }
}

// Save As (File System Access), local font detection, and picture/table copy (navigator.clipboard.write). Text copy and
// paste use DOM clipboard events and need no permission; the studio never reads the clipboard API. Everything else is
// denied, even for the app itself.
const ALLOWED_PERMISSIONS = new Set(['fileSystem', 'local-fonts', 'clipboard-sanitized-write']);

/** Whether the studio may use an Electron permission type (`session.setPermissionRequestHandler` / `setPermissionCheckHandler`). */
export function isAllowedPermission(permission) {
  return ALLOWED_PERMISSIONS.has(permission);
}
