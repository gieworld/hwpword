import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { isAllowedPermission, originOf, resolveAppPath } from '../lib/app-path.mjs';

const root = resolve('studio-dist-fixture');

test('maps app URLs to files inside the root', () => {
  assert.equal(resolveAppPath(root, 'app://hwpword/assets/main.js', 'hwpword'), join(root, 'assets', 'main.js'));
});

test('serves index.html for the bare origin', () => {
  assert.equal(resolveAppPath(root, 'app://hwpword/', 'hwpword'), join(root, 'index.html'));
});

test('decodes percent-encoded file names', () => {
  assert.equal(resolveAppPath(root, 'app://hwpword/fonts/%ED%95%A8.woff2', 'hwpword'), join(root, 'fonts', '함.woff2'));
});

test('refuses encoded separators that would escape the root', () => {
  assert.equal(resolveAppPath(root, 'app://hwpword/..%2f..%2fsecret.txt', 'hwpword'), null);
  assert.equal(resolveAppPath(root, 'app://hwpword/..%5c..%5csecret.txt', 'hwpword'), null);
});

test('refuses other hosts and malformed URLs', () => {
  assert.equal(resolveAppPath(root, 'app://other/index.html', 'hwpword'), null);
  assert.equal(resolveAppPath(root, 'not a url', 'hwpword'), null);
  assert.equal(resolveAppPath(root, 'app://hwpword/%E0%A4%A', 'hwpword'), null);
});

test('originOf reduces URLs to scheme://host, including custom schemes', () => {
  assert.equal(originOf('app://hwpword/index.html'), 'app://hwpword');
  assert.equal(originOf('http://127.0.0.1:7700/src/main.ts'), 'http://127.0.0.1:7700');
  assert.equal(originOf('not a url'), null);
});

test('originOf sees through userinfo that fools a string prefix check', () => {
  assert.equal(originOf('http://127.0.0.1:7700@evil.com/'), 'http://evil.com');
});

test('only the permissions the studio uses are allowed', () => {
  for (const permission of ['fileSystem', 'local-fonts', 'clipboard-read', 'clipboard-sanitized-write']) {
    assert.equal(isAllowedPermission(permission), true, permission);
  }
  for (const permission of ['media', 'geolocation', 'notifications', 'openExternal', 'background-sync', 'web-app-installation', 'unknown', '']) {
    assert.equal(isAllowedPermission(permission), false, permission);
  }
});
