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
